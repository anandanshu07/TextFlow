import { initializeApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut
} from "firebase/auth"

// Removed Firestore imports - using Express backend instead

// Enhanced logging for debugging
const log = (message: string, data?: any) => {
  if (data !== undefined) {
    console.log(`[Slash Auth] ${message}`, data)
  } else {
    console.log(`[Slash Auth] ${message}`)
  }
}

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.PLASMO_PUBLIC_FIREBASE_PUBLIC_API_KEY,
  authDomain: process.env.PLASMO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PLASMO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PLASMO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PLASMO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.PLASMO_PUBLIC_FIREBASE_MEASUREMENT_ID
}

// Initialize Firebase with error handling (auth only)
let app: any = null
let auth: any = null

// Express server configuration
const EXPRESS_SERVER_URL =
  process.env.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:5000"

// Helper function to make authenticated API calls to Express server
const makeApiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  try {
    const accessToken = await getBackendAccessToken()
    if (!accessToken) {
      log("ERROR: No access token available for API call")
      throw new Error("No valid access token available")
    }

    log(`Making API call to ${endpoint}...`)
    const response = await fetch(`${EXPRESS_SERVER_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers
      }
    })

    log(`API call to ${endpoint} responded with status: ${response.status}`)

    // Handle 401 (token expired) - retry with refreshed token
    if (response.status === 401) {
      const errorData = await response.text()
      log(`Got 401 error from ${endpoint}:`, errorData)
      log("Attempting to refresh token...")

      const refreshed = await refreshBackendToken()
      if (refreshed) {
        log("Token refresh successful, retrying API call...")
        // Retry request with new token
        return makeApiCall(endpoint, options)
      }
      log("Token refresh failed")
      throw new Error("Authentication failed - please log in again")
    }

    if (!response.ok) {
      const errorData = await response.text()
      log(`API call to ${endpoint} failed:`, errorData)
      throw new Error(
        `API call failed: ${response.status} ${response.statusText} - ${errorData}`
      )
    }

    const data = await response.json()
    log(`API call to ${endpoint} successful`, data)
    return data
  } catch (error) {
    log(`API call to ${endpoint} threw error:`, error)
    throw error
  }
}

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  // Don't set persistence in background script - handle it manually with Chrome storage
} catch (error) {}

// Backend token storage keys
const ACCESS_TOKEN_KEY = "slash_access_token"
const REFRESH_TOKEN_KEY = "slash_refresh_token"
const TOKEN_EXPIRY_KEY = "slash_token_expiry"

// Migration flag
const MIGRATION_FLAG = "auth_migration_v2_complete"

// Store backend tokens
const storeBackendTokens = async (
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) => {
  try {
    const expiryTime = Date.now() + expiresIn * 1000

    await chrome.storage.local.set({
      [ACCESS_TOKEN_KEY]: accessToken,
      [REFRESH_TOKEN_KEY]: refreshToken,
      [TOKEN_EXPIRY_KEY]: expiryTime
    })
  } catch (error) {
    log("Error storing backend tokens:", error)
  }
}

// Get backend access token with auto-refresh
const getBackendAccessToken = async (): Promise<string | null> => {
  try {
    const result = await chrome.storage.local.get([
      ACCESS_TOKEN_KEY,
      TOKEN_EXPIRY_KEY
    ])

    const accessToken = result[ACCESS_TOKEN_KEY]
    const expiryTime = result[TOKEN_EXPIRY_KEY]

    // If no token exists, return null
    if (!accessToken) {
      log("No access token found in storage")
      return null
    }

    // If no expiry time, token is invalid
    if (!expiryTime) {
      log("No expiry time found - token invalid")
      return null
    }

    // Check if token expired or about to expire (5-second buffer)
    if (Date.now() >= (expiryTime - 5000)) {
      log("Access token expired or expiring soon, refreshing...")
      const refreshed = await refreshBackendToken()
      if (!refreshed) {
        log("Token refresh failed")
        return null
      }
      // Get newly refreshed token
      const newResult = await chrome.storage.local.get([ACCESS_TOKEN_KEY])
      log("Token refreshed successfully")
      return newResult[ACCESS_TOKEN_KEY]
    }

    log("Using valid access token from storage")
    return accessToken
  } catch (error) {
    log("Error getting backend access token:", error)
    return null
  }
}

// Refresh backend tokens using refresh token (with rotation)
const refreshBackendToken = async (): Promise<boolean> => {
  try {
    log("Starting token refresh...")
    const result = await chrome.storage.local.get([REFRESH_TOKEN_KEY])
    const refreshToken = result[REFRESH_TOKEN_KEY]

    if (!refreshToken) {
      log("ERROR: No refresh token found in storage")
      return false
    }

    log("Calling /auth/refresh endpoint...")
    const response = await fetch(`${EXPRESS_SERVER_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshToken}`
      }
    })

    log(`Refresh endpoint responded with status: ${response.status}`)

    if (!response.ok) {
      const errorData = await response.text()
      log("Refresh token failed - response:", errorData)

      // Refresh token invalid/expired - clear storage and require re-login
      await clearBackendTokens()
      // Notify UI about logout
      currentUser = null
      userSnippets = {}
      snippetMetadata = {}
      chrome.runtime
        .sendMessage({
          type: "USER_STATE_CHANGED",
          user: null,
          isLoading: false,
          snippets: {},
          snippetsWithMetadata: []
        })
        .catch(() => {})
      return false
    }

    const data = await response.json()
    log("Refresh successful, new tokens received:", data)
    // { accessToken, refreshToken (new), expiresIn }

    // Store new tokens (refresh token rotated)
    await storeBackendTokens(data.accessToken, data.refreshToken, data.expiresIn)
    log("New tokens stored successfully")

    return true
  } catch (error) {
    log("Token refresh failed with exception:", error)
    return false
  }
}

// Clear backend tokens
const clearBackendTokens = async () => {
  try {
    await chrome.storage.local.remove([
      ACCESS_TOKEN_KEY,
      REFRESH_TOKEN_KEY,
      TOKEN_EXPIRY_KEY
    ])
  } catch (error) {
    log("Error clearing backend tokens:", error)
  }
}

// Exchange Firebase ID token for backend tokens
const exchangeFirebaseTokenForBackendTokens = async (
  firebaseIdToken: string
) => {
  try {
    log("Exchanging Firebase token for backend tokens...")
    const response = await fetch(`${EXPRESS_SERVER_URL}/auth/firebase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`
      }
    })

    log(`Backend responded with status: ${response.status}`)

    if (!response.ok) {
      const errorData = await response.json()
      log("Backend error response:", errorData)
      throw new Error(errorData.error || "Backend authentication failed")
    }

    const data = await response.json()
    log("Backend response data:", data)
    // { accessToken, refreshToken, expiresIn }

    if (!data.accessToken || !data.refreshToken || !data.expiresIn) {
      log("ERROR: Missing tokens in backend response!", data)
      throw new Error("Invalid token response from backend")
    }

    // Store backend tokens
    log("Storing tokens in chrome.storage.local...")
    await storeBackendTokens(data.accessToken, data.refreshToken, data.expiresIn)
    log("Tokens stored successfully")

    return data
  } catch (error) {
    log("Token exchange failed:", error)
    throw new Error(`Token exchange failed: ${error.message}`)
  }
}

// Global state
let currentUser: any = null
let userSnippets: Record<string, string> = {}
let snippetMetadata: Record<
  string,
  { docId: string; usageCount: number; lastUsed?: Date }
> = {}
let isLoading = false

// Load user snippets from Express server with metadata
const loadUserSnippets = async (userId: string) => {
  try {
    const response = await makeApiCall("/api/snippets")

    const snippets: Record<string, string> = {}
    const metadata: Record<
      string,
      { docId: string; usageCount: number; lastUsed?: Date }
    > = {}

    if (response.success && response.snippets) {
      response.snippets.forEach((item: any) => {
        const keyword = item.keyword || item.shortcut || item.trigger
        const value = item.value || item.text || item.content
        const usageCount = item.usageCount || 0
        const lastUsed = item.lastUsed ? new Date(item.lastUsed) : undefined

        if (keyword && value) {
          const formattedKeyword = keyword.startsWith("/")
            ? keyword
            : `/${keyword}`
          snippets[formattedKeyword] = value
          metadata[formattedKeyword] = {
            docId: item.id || item._id,
            usageCount,
            lastUsed
          }
        }
      })
    }

    // Update global state
    snippetMetadata = metadata

    return snippets
  } catch (error) {
    return {}
  }
}

// Increment usage count for a keyword
const incrementUsageCount = async (keyword: string) => {
  if (!currentUser || !snippetMetadata[keyword]) {
    return
  }

  try {
    const { docId } = snippetMetadata[keyword]

    // Update in Express server
    const response = await makeApiCall(`/api/snippets/${docId}/usage`, {
      method: "POST"
    })

    if (response.success) {
      // Update local metadata
      snippetMetadata[keyword].usageCount += 1
      snippetMetadata[keyword].lastUsed = new Date()

      // Notify content scripts and popup about usage update
      const usageData = {
        keyword,
        usageCount: snippetMetadata[keyword].usageCount,
        lastUsed: snippetMetadata[keyword].lastUsed
      }

      // Notify popup
      chrome.runtime
        .sendMessage({
          type: "USAGE_UPDATED",
          ...usageData
        })
        .catch(() => {
          // Popup might not be open, ignore errors
        })

      // Notify content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "USAGE_UPDATED",
                ...usageData
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })
    }
  } catch (error) {
    log("❌ Error incrementing usage count:", error)
  }
}

// Get snippets with metadata for popup
const getSnippetsWithMetadata = () => {
  const snippetsWithMetadata = Object.entries(userSnippets).map(
    ([keyword, value]) => ({
      keyword,
      value,
      usageCount: snippetMetadata[keyword]?.usageCount || 0,
      lastUsed: snippetMetadata[keyword]?.lastUsed || null,
      docId: snippetMetadata[keyword]?.docId || null
    })
  )

  return snippetsWithMetadata
}

// Firebase onAuthStateChanged is no longer used for state management
// State is now managed via backend tokens in handleLogin/handleLogout/loadUserData

// Load user data after authentication
const loadUserData = async () => {
  try {
    // Get current user info from backend
    const response = await makeApiCall("/api/user/me")

    currentUser = {
      uid: response.user.firebaseUid,
      email: response.user.email,
      displayName: response.user.displayName,
      photoURL: response.user.photoURL
    }

    // Load snippets
    userSnippets = await loadUserSnippets(currentUser.uid)

    // Broadcast to UI
    chrome.runtime
      .sendMessage({
        type: "USER_STATE_CHANGED",
        user: currentUser,
        isLoading: false,
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
      .catch(() => {})

    // Notify content scripts about user login
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "USER_LOGIN",
              user: {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL
              },
              snippets: userSnippets,
              snippetsWithMetadata: getSnippetsWithMetadata()
            })
            .catch(() => {})
        }
      })
    })

    return true
  } catch (error) {
    log("Failed to load user data:", error)
    return false
  }
}

// Handle login request
const handleLogin = async () => {
  if (isLoading) {
    return { success: false, error: "Login already in progress" }
  }

  isLoading = true

  try {
    // Check if Firebase auth is properly initialized
    if (!auth) {
      throw new Error("Firebase auth not properly initialized")
    }

    if (!chrome.identity) {
      throw new Error("Chrome identity API not available")
    }

    return new Promise((resolve) => {
      // Step 1: Get Google OAuth token via Chrome Identity
      chrome.identity.getAuthToken({ interactive: true }, async (oauthToken) => {
        try {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message)
          }

          if (!oauthToken) {
            throw new Error("No token received from chrome.identity")
          }

          if (!auth) {
            throw new Error("Firebase auth not available during sign in")
          }

          // Step 2: Sign in to Firebase (ONLY to get ID token)
          const credential = GoogleAuthProvider.credential(null, oauthToken)
          await signInWithCredential(auth, credential)

          // Step 3: Get Firebase ID token
          const firebaseIdToken = await auth.currentUser.getIdToken()

          // Step 4: Exchange with backend for backend tokens
          await exchangeFirebaseTokenForBackendTokens(firebaseIdToken)

          // Step 5: Clean up Firebase session (no longer needed)
          await signOut(auth)

          // Step 6: Clear Chrome Identity cache
          chrome.identity.removeCachedAuthToken({ token: oauthToken }, () => {})

          // Step 7: Load user data using backend tokens
          await loadUserData()

          isLoading = false
          resolve({ success: true })
        } catch (error) {
          isLoading = false
          resolve({ success: false, error: error.message })
        }
      })
    })
  } catch (error) {
    isLoading = false
    return { success: false, error: error.message }
  }
}

// Handle logout request
const handleLogout = async () => {
  try {
    const result = await chrome.storage.local.get([REFRESH_TOKEN_KEY])
    const refreshToken = result[REFRESH_TOKEN_KEY]

    // Notify backend to revoke refresh token
    if (refreshToken) {
      try {
        await fetch(`${EXPRESS_SERVER_URL}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${refreshToken}`
          }
        })
      } catch (error) {
        // Continue with local logout even if backend call fails
        log("Backend logout failed:", error)
      }
    }

    // Clear backend tokens from storage
    await clearBackendTokens()

    // Clear Firebase session (if any)
    if (auth) {
      await signOut(auth)
    }

    // Reset local state
    currentUser = null
    userSnippets = {}
    snippetMetadata = {}

    // Notify popup about logout
    chrome.runtime
      .sendMessage({
        type: "USER_STATE_CHANGED",
        user: null,
        isLoading: false,
        snippets: {},
        snippetsWithMetadata: []
      })
      .catch(() => {})

    // Notify content scripts about logout
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "USER_LOGOUT"
            })
            .catch(() => {})
        }
      })
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Handle snippet refresh request
const handleRefreshSnippets = async () => {
  if (!currentUser) {
    return { success: false, error: "No user logged in" }
  }

  try {
    userSnippets = await loadUserSnippets(currentUser.uid)

    // Notify content scripts about snippet update
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "SNIPPETS_UPDATED",
              snippets: userSnippets,
              snippetsWithMetadata: getSnippetsWithMetadata()
            })
            .catch(() => {
              // Tab might not have content script, ignore errors
            })
        }
      })
    })

    return {
      success: true,
      snippets: userSnippets,
      snippetsWithMetadata: getSnippetsWithMetadata()
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Save snippet to Express server
const saveSnippetToExpressServer = async (keyword: string, value: string) => {
  if (!currentUser) {
    return {
      success: false,
      error: "No user logged in"
    }
  }

  try {
    // Save the snippet to Express server
    const response = await makeApiCall("/api/snippets", {
      method: "POST",
      body: JSON.stringify({
        keyword,
        value,
        usageCount: 0,
        lastUsed: null
      })
    })

    if (response.success) {
      // Refresh snippets from database to ensure consistency
      const refreshedSnippets = await loadUserSnippets(currentUser.uid)
      userSnippets = refreshedSnippets

      // Notify content scripts about snippet update
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "SNIPPETS_UPDATED",
                snippets: userSnippets,
                snippetsWithMetadata: getSnippetsWithMetadata()
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })

      return {
        success: true,
        docId: response.snippet.id || response.snippet._id
      }
    } else {
      return {
        success: false,
        error: response.error || "Failed to save snippet"
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Update existing snippet in Express server
const updateSnippetInExpressServer = async (
  docId: string,
  keyword: string,
  value: string
) => {
  if (!currentUser) {
    return {
      success: false,
      error: "No user logged in"
    }
  }

  try {
    // Update the snippet in Express server
    const response = await makeApiCall(`/api/snippets/${docId}`, {
      method: "PUT",
      body: JSON.stringify({
        keyword,
        value
      })
    })

    if (response.success) {
      // Refresh snippets from database to ensure consistency
      const refreshedSnippets = await loadUserSnippets(currentUser.uid)
      userSnippets = refreshedSnippets

      // Notify content scripts about snippet update
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "SNIPPETS_UPDATED",
                snippets: userSnippets,
                snippetsWithMetadata: getSnippetsWithMetadata()
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })

      return {
        success: true,
        docId: docId
      }
    } else {
      return {
        success: false,
        error: response.error || "Failed to update snippet"
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Delete snippet from Express server
const deleteSnippetFromExpressServer = async (keyword: string) => {
  if (!currentUser) {
    return {
      success: false,
      error: "No user logged in"
    }
  }

  try {
    if (!snippetMetadata[keyword]) {
      return { success: false, error: "Snippet not found" }
    }

    const { docId } = snippetMetadata[keyword]

    // Delete the snippet from Express server
    const response = await makeApiCall(`/api/snippets/${docId}`, {
      method: "DELETE"
    })

    if (response.success) {
      // Refresh snippets from database to ensure consistency
      const refreshedSnippets = await loadUserSnippets(currentUser.uid)
      userSnippets = refreshedSnippets

      // Notify content scripts about snippet update
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "SNIPPETS_UPDATED",
                snippets: userSnippets,
                snippetsWithMetadata: getSnippetsWithMetadata()
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })

      return { success: true }
    } else {
      return {
        success: false,
        error: response.error || "Failed to delete snippet"
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Handle message from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "TEST_BACKGROUND":
      sendResponse({
        success: true,
        message: "Background script is working",
        firebaseAuthInitialized: !!auth,
        expressServerUrl: EXPRESS_SERVER_URL
      })
      return true

    case "LOGIN":
      handleLogin().then(sendResponse)
      return true // Keep message channel open for async response

    case "LOGOUT":
      handleLogout().then(sendResponse)
      return true

    case "GET_USER":
      sendResponse({
        user: currentUser,
        isLoading,
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
      break

    case "REFRESH_SNIPPETS":
      handleRefreshSnippets().then(sendResponse)
      return true

    case "GET_SNIPPETS":
      sendResponse({
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata(),
        user: currentUser
      })
      break

    case "SAVE_SNIPPET":
      saveSnippetToExpressServer(message.keyword, message.value).then(
        sendResponse
      )
      return true

    case "UPDATE_SNIPPET":
      updateSnippetInExpressServer(
        message.docId,
        message.keyword,
        message.value
      ).then(sendResponse)
      return true

    case "DELETE_SNIPPET":
      deleteSnippetFromExpressServer(message.keyword).then(sendResponse)
      return true

    case "INCREMENT_USAGE":
      incrementUsageCount(message.keyword)
      sendResponse({ success: true })
      break

    case "GET_USAGE_STATS":
      const stats = Object.entries(snippetMetadata)
        .map(([keyword, meta]) => ({
          keyword,
          usageCount: meta.usageCount,
          lastUsed: meta.lastUsed
        }))
        .sort((a, b) => b.usageCount - a.usageCount)

      sendResponse({
        success: true,
        stats,
        totalUsage: stats.reduce((sum, stat) => sum + stat.usageCount, 0)
      })
      break

    case "TEST_BACKEND":
      // Test the backend connection
      if (!currentUser) {
        sendResponse({
          success: false,
          error: "No user logged in"
        })
      } else {
        // Make a simple test call to the backend
        makeApiCall("/api/test")
          .then(() => {
            sendResponse({
              success: true,
              message: "Backend is connected and accessible"
            })
          })
          .catch((error) => {
            sendResponse({
              success: false,
              error: `Backend connection failed: ${error.message}`
            })
          })
      }
      return true

    case "DEBUG_STORAGE":
      chrome.storage.local.get(null, (items) => {
        sendResponse({
          success: true,
          storedItems: items,
          hasAccessToken: !!items[ACCESS_TOKEN_KEY],
          hasRefreshToken: !!items[REFRESH_TOKEN_KEY],
          tokenExpiry: items[TOKEN_EXPIRY_KEY]
            ? new Date(items[TOKEN_EXPIRY_KEY]).toISOString()
            : null,
          isTokenValid: items[TOKEN_EXPIRY_KEY]
            ? Date.now() < items[TOKEN_EXPIRY_KEY]
            : false
        })
      })
      return true

    case "CLEAR_STORAGE":
      clearBackendTokens().then(() => {
        sendResponse({ success: true, message: "Storage cleared successfully" })
      })
      return true

    default:
      sendResponse({ error: "Unknown message type" })
  }
})

// Handle tab updates to notify content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && currentUser) {
    // Small delay to ensure content script is loaded
    setTimeout(() => {
      chrome.tabs
        .sendMessage(tabId, {
          type: "USER_LOGIN",
          user: {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL
          },
          snippets: userSnippets,
          snippetsWithMetadata: getSnippetsWithMetadata()
        })
        .catch(() => {
          // Tab might not have content script, ignore errors
        })
    }, 1000)
  }
})

// Initialize background script with migration and auto-login

// Migration logic for extension update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "update" || details.reason === "install") {
    const migrationResult = await chrome.storage.local.get([MIGRATION_FLAG])

    if (!migrationResult[MIGRATION_FLAG]) {
      log("Running auth migration v2...")

      // Clear old Firebase/OAuth tokens
      await chrome.storage.local.remove([
        "quicktype_oauth_token",
        "quicktype_token_expiry",
        "quicktype_refresh_token"
      ])

      // Clear Firebase session
      if (auth) {
        await signOut(auth)
      }

      // Mark migration complete
      await chrome.storage.local.set({ [MIGRATION_FLAG]: true })

      // Force logout state
      currentUser = null
      userSnippets = {}
      snippetMetadata = {}

      log("Migration complete - users will need to log in again")
    }
  }
})

// Simple auto-login attempt on startup
const attemptAutoLogin = async () => {
  try {
    // Check if we have backend tokens
    const result = await chrome.storage.local.get([
      ACCESS_TOKEN_KEY,
      REFRESH_TOKEN_KEY
    ])

    if (result[ACCESS_TOKEN_KEY] && result[REFRESH_TOKEN_KEY]) {
      // Try to load user data with existing tokens
      const success = await loadUserData()
      if (success) {
        log("Auto-login successful with backend tokens")
      } else {
        log("Auto-login failed - tokens may be invalid")
        await clearBackendTokens()
      }
    }
  } catch (error) {
    log("Auto-login error:", error)
  }
}

// Single startup attempt after a short delay
setTimeout(attemptAutoLogin, 1000)


