import { initializeApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut
} from "firebase/auth"

// Removed Firestore imports - using Express backend instead

// Enhanced logging - removed console logs
const log = (message: string, data?: any) => {
  // Console logs removed
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
      return null
    }

    const idToken = await auth.currentUser.getIdToken()

    return idToken
  } catch (error) {
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
    throw error
  }
}

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  // Don't set persistence in background script - handle it manually with Chrome storage
} catch (error) {}

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
  } catch (error) {}
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
      return null
    }

    // Check if token is expired
    if (Date.now() > expiry) {
      // Try to get a fresh token without user interaction
      const refreshedToken = await refreshOAuthToken()
      if (refreshedToken) {
        return refreshedToken
      }

      // If refresh fails, clear the expired token
      await clearStoredOAuthToken()
      return null
    }

    return token
  } catch (error) {
    return null
  }
}

// Refresh OAuth token silently
const refreshOAuthToken = async (): Promise<string | null> => {
  try {
    if (!chrome.identity) {
      return null
    }

    return new Promise((resolve) => {
      // Try to get a token without user interaction
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError) {
          resolve(null)
          return
        }

        if (!token) {
          resolve(null)
          return
        }

        await storeOAuthToken(token)
        resolve(token)
      })
    })
  } catch (error) {
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
  } catch (error) {}
}

// Try to authenticate with stored token
const tryAuthWithStoredToken = async (): Promise<boolean> => {
  try {
    const storedToken = await getStoredOAuthToken()

    if (!storedToken || !auth) {
      return false
    }

    const credential = GoogleAuthProvider.credential(null, storedToken)
    await signInWithCredential(auth, credential)

    return true
  } catch (error) {
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
        resolve(true)
        return
      }

      // Fallback to auth state change listener with shorter timeout
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe() // Immediately unsubscribe after first check
        if (user) {
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

// Sync user to backend server
const syncUserToBackend = async (user: any) => {
  try {
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
    } else {
    }
  } catch (error) {}
}

// Handle authentication state changes
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user
    isLoading = false

    if (user) {
      // Sync user to backend first
      await syncUserToBackend(user)

      userSnippets = await loadUserSnippets(user.uid)

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

    // First, check if we already have an authenticated user in Firebase
    const hasExistingAuth = await checkExistingAuth()
    if (hasExistingAuth) {
      isLoading = false
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

    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        try {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message)
          }

          if (!token) {
            throw new Error("No token received from chrome.identity")
          }

          // Store the token for future use
          await storeOAuthToken(token)

          if (!auth) {
            throw new Error("Firebase auth not available during sign in")
          }

          const credential = GoogleAuthProvider.credential(null, token)
          await signInWithCredential(auth, credential)

          resolve({ success: true, usedStoredToken: false })
        } catch (error) {
          resolve({ success: false, error: error.message })
        } finally {
          isLoading = false
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
          chrome.identity.removeCachedAuthToken({ token }, () => {})
        }
      } catch (error) {}
    }

    // Sign out from Firebase
    await signOut(auth)

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
      clearStoredOAuthToken().then(() => {
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

// Try to auto-login on startup with multiple strategies
// Use a longer delay for service worker context to ensure everything is ready
const attemptAutoLogin = async () => {
  try {
    if (!currentUser && !isLoading && auth) {
      // Strategy 1: Check existing Firebase auth state
      const hasExistingAuth = await checkExistingAuth()
      if (hasExistingAuth) {
        return
      }

      // Strategy 2: Try stored token authentication
      const storedTokenResult = await tryAuthWithStoredToken()
      if (storedTokenResult) {
        return
      }
    } else if (!auth) {
    }
  } catch (error) {}
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
        const refreshedToken = await refreshOAuthToken()
        if (refreshedToken) {
        }
      }
    } catch (error) {}
  },
  30 * 60 * 1000
) // 30 minutes


