import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut } from "firebase/auth";





// Removed Firestore imports - using Express backend instead

// Enhanced logging
const log = (message: string, data?: any) => {
  console.log(`[QuickType Background] ${message}`, data || "")
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
const EXPRESS_SERVER_URL = "https://slash-backend-73zn.onrender.com"

// Helper function to get Firebase ID token
const getFirebaseIdToken = async (): Promise<string | null> => {
  try {
    if (!auth || !auth.currentUser) {
      log("❌ No authenticated user found")
      return null
    }

    const idToken = await auth.currentUser.getIdToken()
    log("✅ Firebase ID token retrieved")
    return idToken
  } catch (error) {
    log("❌ Error getting Firebase ID token:", error)
    return null
  }
}

// Helper function to make authenticated API calls to Express server
const makeApiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  try {
    const idToken = await getFirebaseIdToken()
    if (!idToken) {
      throw new Error("No valid Firebase ID token available")
    }

    const response = await fetch(`${EXPRESS_SERVER_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...options.headers
      }
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(
        `API call failed: ${response.status} ${response.statusText} - ${errorData}`
      )
    }

    return await response.json()
  } catch (error) {
    log(`❌ API call to ${endpoint} failed:`, error)
    throw error
  }
}

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  // Don't set persistence in background script - handle it manually with Chrome storage
  log("✅ Firebase auth initialized successfully")
} catch (error) {
  log("❌ Firebase initialization failed:", error)
}

// OAuth token storage keys
const OAUTH_TOKEN_KEY = "quicktype_oauth_token"
const TOKEN_EXPIRY_KEY = "quicktype_token_expiry"
const REFRESH_TOKEN_KEY = "quicktype_refresh_token"

// Store OAuth token with expiry
const storeOAuthToken = async (token: string) => {
  try {
    // Calculate expiry time (50 minutes from now, tokens usually expire in 1 hour)
    const expiryTime = Date.now() + 50 * 60 * 1000

    await chrome.storage.local.set({
      [OAUTH_TOKEN_KEY]: token,
      [TOKEN_EXPIRY_KEY]: expiryTime
    })

    log("✅ OAuth token stored successfully")
  } catch (error) {
    log("❌ Error storing OAuth token:", error)
  }
}

// Retrieve stored OAuth token
const getStoredOAuthToken = async (): Promise<string | null> => {
  try {
    const result = await chrome.storage.local.get([
      OAUTH_TOKEN_KEY,
      TOKEN_EXPIRY_KEY
    ])
    const token = result[OAUTH_TOKEN_KEY]
    const expiry = result[TOKEN_EXPIRY_KEY]

    if (!token || !expiry) {
      log("ℹ️ No stored OAuth token found")
      return null
    }

    // Check if token is expired
    if (Date.now() > expiry) {
      log("⏰ Stored OAuth token has expired, attempting refresh...")

      // Try to get a fresh token without user interaction
      const refreshedToken = await refreshOAuthToken()
      if (refreshedToken) {
        return refreshedToken
      }

      // If refresh fails, clear the expired token
      await clearStoredOAuthToken()
      return null
    }

    log("✅ Valid stored OAuth token found")
    return token
  } catch (error) {
    log("❌ Error retrieving stored OAuth token:", error)
    return null
  }
}

// Refresh OAuth token silently
const refreshOAuthToken = async (): Promise<string | null> => {
  try {
    if (!chrome.identity) {
      log("❌ Chrome identity API not available for token refresh")
      return null
    }

    log("🔄 Attempting to refresh OAuth token...")

    return new Promise((resolve) => {
      // Try to get a token without user interaction
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError) {
          log("❌ Token refresh failed:", chrome.runtime.lastError.message)
          resolve(null)
          return
        }

        if (!token) {
          log("❌ No token received during refresh")
          resolve(null)
          return
        }

        log("✅ Token refreshed successfully")
        await storeOAuthToken(token)
        resolve(token)
      })
    })
  } catch (error) {
    log("❌ Error during token refresh:", error)
    return null
  }
}

// Clear stored OAuth token
const clearStoredOAuthToken = async () => {
  try {
    await chrome.storage.local.remove([
      OAUTH_TOKEN_KEY,
      TOKEN_EXPIRY_KEY,
      REFRESH_TOKEN_KEY
    ])
    log("✅ Stored OAuth token cleared")
  } catch (error) {
    log("❌ Error clearing stored OAuth token:", error)
  }
}

// Try to authenticate with stored token
const tryAuthWithStoredToken = async (): Promise<boolean> => {
  try {
    const storedToken = await getStoredOAuthToken()

    if (!storedToken || !auth) {
      return false
    }

    log("🔄 Attempting authentication with stored token")

    const credential = GoogleAuthProvider.credential(null, storedToken)
    await signInWithCredential(auth, credential)

    log("✅ Successfully authenticated with stored token")
    return true
  } catch (error) {
    log("❌ Failed to authenticate with stored token:", error)
    // Clear invalid token
    await clearStoredOAuthToken()
    return false
  }
}

// Check if user is already authenticated
const checkExistingAuth = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!auth) {
      resolve(false)
      return
    }

    // In service worker context, we need to be more careful with auth state
    try {
      // Check current user directly first
      if (auth.currentUser) {
        log("✅ Existing Firebase auth found:", auth.currentUser.email)
        resolve(true)
        return
      }

      // Fallback to auth state change listener with shorter timeout
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe() // Immediately unsubscribe after first check
        if (user) {
          log("✅ Auth state change detected user:", user.email)
          resolve(true)
        } else {
          resolve(false)
        }
      })

      // Shorter timeout for service worker context
      setTimeout(() => {
        unsubscribe()
        resolve(false)
      }, 2000)
    } catch (error) {
      log("❌ Error checking existing auth:", error)
      resolve(false)
    }
  })
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
    log("📥 Loading snippets for user:", userId)

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
          log(
            `✅ Loaded snippet: ${formattedKeyword} -> ${value} (used ${usageCount} times)`
          )
        }
      })
    }

    // Update global state
    snippetMetadata = metadata

    log(`🎉 Loaded ${Object.keys(snippets).length} snippets with metadata`)
    return snippets
  } catch (error) {
    log("❌ Error loading snippets:", error)
    return {}
  }
}

// Increment usage count for a keyword
const incrementUsageCount = async (keyword: string) => {
  if (!currentUser || !snippetMetadata[keyword]) {
    log(
      "❌ Cannot increment usage count - user not logged in or keyword not found"
    )
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

      log(
        `📈 Usage count incremented for ${keyword}: ${snippetMetadata[keyword].usageCount}`
      )

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

// Sync user to backend server
const syncUserToBackend = async (user: any) => {
  try {
    log("👤 Syncing user to backend:", user.email)

    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLoginAt: new Date().toISOString()
    }

    const response = await makeApiCall("/api/user/sync", {
      method: "POST",
      body: JSON.stringify(userData)
    })

    if (response.success) {
      log("✅ User synced to backend successfully")
    } else {
      log("⚠️ User sync failed:", response.error)
    }
  } catch (error) {
    log("❌ Error syncing user to backend:", error)
  }
}

// Handle authentication state changes
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    log("🔄 Auth state changed:", user ? "User logged in" : "User logged out")
    log(
      "🔄 User details:",
      user
        ? { uid: user.uid, email: user.email, displayName: user.displayName }
        : "No user"
    )

    currentUser = user
    isLoading = false

    if (user) {
      log("👤 User authenticated:", user.email)

      // Sync user to backend first
      await syncUserToBackend(user)

      userSnippets = await loadUserSnippets(user.uid)
      log("📦 Loaded snippets for user:", userSnippets)
      log("📊 Loaded snippet metadata:", snippetMetadata)

      // Notify popup about user state change with metadata
      chrome.runtime
        .sendMessage({
          type: "USER_STATE_CHANGED",
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
          },
          isLoading: false,
          snippets: userSnippets,
          snippetsWithMetadata: getSnippetsWithMetadata()
        })
        .catch(() => {
          // Popup might not be open, ignore errors
        })

      // Notify content scripts about user login
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "USER_LOGIN",
                user: {
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName
                },
                snippets: userSnippets,
                snippetsWithMetadata: getSnippetsWithMetadata()
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })
    } else {
      log("🚫 User logged out")
      userSnippets = {}
      snippetMetadata = {}

      // Notify popup about user state change
      chrome.runtime
        .sendMessage({
          type: "USER_STATE_CHANGED",
          user: null,
          isLoading: false,
          snippets: {},
          snippetsWithMetadata: []
        })
        .catch(() => {
          // Popup might not be open, ignore errors
        })

      // Notify content scripts about user logout
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "USER_LOGOUT"
              })
              .catch(() => {
                // Tab might not have content script, ignore errors
              })
          }
        })
      })
    }
  })
} else {
  log("⚠️ Auth not available, skipping auth state listener")
}

// Handle login request
const handleLogin = async () => {
  if (isLoading) {
    log("⏳ Login already in progress")
    return { success: false, error: "Login already in progress" }
  }

  isLoading = true
  log("🚀 Starting login process")

  try {
    // Check if Firebase auth is properly initialized
    if (!auth) {
      throw new Error("Firebase auth not properly initialized")
    }

    // First, check if we already have an authenticated user in Firebase
    const hasExistingAuth = await checkExistingAuth()
    if (hasExistingAuth) {
      isLoading = false
      log("✅ Already authenticated in Firebase")
      return { success: true, alreadyAuthenticated: true }
    }

    // Try to authenticate with stored token
    const storedAuthSuccess = await tryAuthWithStoredToken()
    if (storedAuthSuccess) {
      isLoading = false
      return { success: true, usedStoredToken: true }
    }

    if (!chrome.identity) {
      throw new Error("Chrome identity API not available")
    }

    log("🔄 Requesting new OAuth token from Chrome Identity...")

    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        try {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message)
          }

          if (!token) {
            throw new Error("No token received from chrome.identity")
          }

          log("✅ Token received, creating Firebase credential")

          // Store the token for future use
          await storeOAuthToken(token)

          if (!auth) {
            throw new Error("Firebase auth not available during sign in")
          }

          const credential = GoogleAuthProvider.credential(null, token)
          await signInWithCredential(auth, credential)

          log("✅ Firebase sign in successful")
          resolve({ success: true, usedStoredToken: false })
        } catch (error) {
          log("❌ Login failed:", error)
          resolve({ success: false, error: error.message })
        } finally {
          isLoading = false
        }
      })
    })
  } catch (error) {
    isLoading = false
    log("❌ Login error:", error)
    return { success: false, error: error.message }
  }
}

// Handle logout request
const handleLogout = async () => {
  try {
    if (!auth) {
      throw new Error("Firebase auth not available")
    }

    // Clear stored OAuth token
    await clearStoredOAuthToken()

    // Remove cached token from Chrome Identity
    if (chrome.identity && chrome.identity.removeCachedAuthToken) {
      try {
        const token = await getStoredOAuthToken()
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            log("✅ Cached auth token removed from Chrome Identity")
          })
        }
      } catch (error) {
        log("⚠️ Could not remove cached auth token:", error)
      }
    }

    // Sign out from Firebase
    await signOut(auth)

    log("✅ Logout successful")
    return { success: true }
  } catch (error) {
    log("❌ Logout error:", error)
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
    log("✅ Snippets refreshed")

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
    log("❌ Error refreshing snippets:", error)
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
      log(`✅ Snippet saved to Express server: ${keyword} -> ${value}`)

      // Update local snippets and metadata
      userSnippets[keyword] = value
      snippetMetadata[keyword] = {
        docId: response.snippet.id || response.snippet._id,
        usageCount: 0,
        lastUsed: undefined
      }

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
    log("❌ Error saving snippet to Express server:", error)
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
      log(`✅ Snippet deleted from Express server: ${keyword}`)

      // Remove from local snippets and metadata
      delete userSnippets[keyword]
      delete snippetMetadata[keyword]

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
    log("❌ Error deleting snippet from Express server:", error)
    return { success: false, error: error.message }
  }
}

// Handle message from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("📨 Message received:", message.type)

  switch (message.type) {
    case "TEST_BACKGROUND":
      log("🧪 Background script test received")
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
      log("👤 GET_USER request - currentUser:", currentUser)
      log("👤 GET_USER request - userSnippets:", userSnippets)
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

    case "DELETE_SNIPPET":
      deleteSnippetFromExpressServer(message.keyword).then(sendResponse)
      return true

    case "INCREMENT_USAGE":
      log("📈 Incrementing usage for keyword:", message.keyword)
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
      log("🧪 Backend connection test received")
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
            log("✅ Backend test successful")
            sendResponse({
              success: true,
              message: "Backend is connected and accessible"
            })
          })
          .catch((error) => {
            log("❌ Backend test failed:", error)
            sendResponse({
              success: false,
              error: `Backend connection failed: ${error.message}`
            })
          })
      }
      return true

    case "DEBUG_STORAGE":
      log("🐛 Debug storage request received")
      chrome.storage.local.get(null, (items) => {
        log("📦 All stored items:", items)
        sendResponse({
          success: true,
          storedItems: items,
          hasOAuthToken: !!items[OAUTH_TOKEN_KEY],
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
      log("🗑️ Clear storage request received")
      clearStoredOAuthToken().then(() => {
        sendResponse({ success: true, message: "Storage cleared successfully" })
      })
      return true

    default:
      log("❓ Unknown message type:", message.type)
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
            displayName: currentUser.displayName
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

// Initialize background script with auto-login attempt
log("🚀 QuickType background script initialized with persistent login")

// Try to auto-login on startup with multiple strategies
// Use a longer delay for service worker context to ensure everything is ready
const attemptAutoLogin = async () => {
  try {
    if (!currentUser && !isLoading && auth) {
      log("🔄 Attempting auto-login with multiple strategies...")

      // Strategy 1: Check existing Firebase auth state
      const hasExistingAuth = await checkExistingAuth()
      if (hasExistingAuth) {
        log("✅ Auto-login successful via existing Firebase auth")
        return
      }

      // Strategy 2: Try stored token authentication
      const storedTokenResult = await tryAuthWithStoredToken()
      if (storedTokenResult) {
        log("✅ Auto-login successful via stored token")
        return
      }

      log("ℹ️ No valid stored credentials for auto-login")
    } else if (!auth) {
      log("⚠️ Firebase auth not properly initialized, skipping auto-login")
    }
  } catch (error) {
    log("❌ Auto-login attempt failed:", error)
  }
}

// Multiple startup attempts to handle service worker timing issues
setTimeout(attemptAutoLogin, 1000)
setTimeout(attemptAutoLogin, 3000)
setTimeout(attemptAutoLogin, 5000)

// Periodic token refresh check (every 30 minutes)
setInterval(
  async () => {
    try {
      if (currentUser && auth) {
        log("🔄 Performing periodic token refresh check...")
        const refreshedToken = await refreshOAuthToken()
        if (refreshedToken) {
          log("✅ Token refreshed successfully during periodic check")
        }
      }
    } catch (error) {
      log("❌ Periodic token refresh failed:", error)
    }
  },
  30 * 60 * 1000
) // 30 minutes