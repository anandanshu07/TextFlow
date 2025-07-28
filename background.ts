import { initializeApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signOut
} from "firebase/auth"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  increment,
  orderBy,
  query,
  updateDoc,
  where
} from "firebase/firestore"

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

// Initialize Firebase with error handling
let app: any = null
let auth: any = null
let firestore: any = null

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  firestore = getFirestore(app)

  // Set persistence - use inMemoryPersistence for background script
  setPersistence(auth, inMemoryPersistence)

  log("✅ Firebase initialized successfully")
} catch (error) {
  log("❌ Firebase initialization failed:", error)
}

// Global state
let currentUser: any = null
let userSnippets: Record<string, string> = {}
let snippetMetadata: Record<
  string,
  { docId: string; usageCount: number; lastUsed?: Date }
> = {}
let isLoading = false

// Load user snippets from Firebase with metadata
const loadUserSnippets = async (userId: string) => {
  if (!firestore) {
    log("❌ Firestore not available")
    return {}
  }

  try {
    log("📥 Loading snippets for user:", userId)

    const userItemsRef = collection(
      firestore,
      "quickTypeItems",
      userId,
      "items"
    )
    const snapshot = await getDocs(userItemsRef)

    const snippets: Record<string, string> = {}
    const metadata: Record<
      string,
      { docId: string; usageCount: number; lastUsed?: Date }
    > = {}

    if (!snapshot.empty) {
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        const keyword = data.keyword || data.shortcut || data.trigger
        const value = data.value || data.text || data.content
        const usageCount = data.usageCount || 0
        const lastUsed = data.lastUsed ? data.lastUsed.toDate() : undefined

        if (keyword && value) {
          const formattedKeyword = keyword.startsWith("/")
            ? keyword
            : `/${keyword}`
          snippets[formattedKeyword] = value
          metadata[formattedKeyword] = {
            docId: doc.id,
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
  if (!currentUser || !firestore || !snippetMetadata[keyword]) {
    log(
      "❌ Cannot increment usage count - user not logged in or keyword not found"
    )
    return
  }

  try {
    const { docId } = snippetMetadata[keyword]
    const docRef = doc(
      firestore,
      "quickTypeItems",
      currentUser.uid,
      "items",
      docId
    )

    // Update in Firebase
    await updateDoc(docRef, {
      usageCount: increment(1),
      lastUsed: new Date()
    })

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
    // Check if Firebase is properly initialized
    if (!auth || !firestore) {
      throw new Error("Firebase not properly initialized")
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

          log("✅ Token received, creating Firebase credential")
          const credential = GoogleAuthProvider.credential(null, token)
          await signInWithCredential(auth, credential)

          log("✅ Firebase sign in successful")
          log("✅ Current user after sign in:", currentUser)
          resolve({ success: true })
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

// Save snippet to Firebase
const saveSnippetToFirebase = async (keyword: string, value: string) => {
  if (!currentUser || !firestore) {
    return {
      success: false,
      error: "No user logged in or Firestore not available"
    }
  }

  try {
    const userItemsRef = collection(
      firestore,
      "quickTypeItems",
      currentUser.uid,
      "items"
    )

    // Add the snippet to Firebase with initial usage count
    const docRef = await addDoc(userItemsRef, {
      keyword,
      value,
      userId: currentUser.uid,
      usageCount: 0,
      lastUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    log(`✅ Snippet saved to Firebase: ${keyword} -> ${value}`)

    // Update local snippets and metadata
    userSnippets[keyword] = value
    snippetMetadata[keyword] = {
      docId: docRef.id,
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

    return { success: true, docId: docRef.id }
  } catch (error) {
    log("❌ Error saving snippet to Firebase:", error)
    return { success: false, error: error.message }
  }
}

// Delete snippet from Firebase
const deleteSnippetFromFirebase = async (keyword: string) => {
  if (!currentUser || !firestore) {
    return {
      success: false,
      error: "No user logged in or Firestore not available"
    }
  }

  try {
    // First, find the document with this keyword
    const userItemsRef = collection(
      firestore,
      "quickTypeItems",
      currentUser.uid,
      "items"
    )
    const q = query(userItemsRef, where("keyword", "==", keyword))
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      // Delete the first matching document
      const docToDelete = snapshot.docs[0]
      await deleteDoc(
        doc(
          firestore,
          "quickTypeItems",
          currentUser.uid,
          "items",
          docToDelete.id
        )
      )

      log(`✅ Snippet deleted from Firebase: ${keyword}`)

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
      return { success: false, error: "Snippet not found" }
    }
  } catch (error) {
    log("❌ Error deleting snippet from Firebase:", error)
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
        firebaseInitialized: !!(auth && firestore)
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
      saveSnippetToFirebase(message.keyword, message.value).then(sendResponse)
      return true

    case "DELETE_SNIPPET":
      deleteSnippetFromFirebase(message.keyword).then(sendResponse)
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

// Initialize background script
log("🚀 QuickType background script initialized with usage tracking")
