import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential
} from "firebase/auth"
import type { User } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { useEffect, useMemo, useState } from "react"

import { app, auth } from "~firebase"

setPersistence(auth, browserLocalPersistence)

export const useFirebase = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<User>(null)
  const [error, setError] = useState<string | null>(null)

  const firestore = useMemo(() => (user ? getFirestore(app) : null), [user])

  const onLogout = async () => {
    setIsLoading(true)
    if (user) {
      await auth.signOut()
    }
  }

  const onLogin = () => {
    console.log("🚀 Login button clicked")
    console.log("🔍 Extension ID:", chrome.runtime.id)
    console.log("🔍 Chrome identity available:", !!chrome.identity)

    setIsLoading(true)
    setError(null)

    // Check if chrome.identity is available
    if (!chrome.identity) {
      const errorMsg = "chrome.identity is not available"
      console.error("❌", errorMsg)
      setError(errorMsg)
      setIsLoading(false)
      return
    }

    console.log("📞 Calling chrome.identity.getAuthToken...")

    chrome.identity.getAuthToken(
      {
        interactive: true
      },
      async function (token) {
        console.log("📞 getAuthToken callback executed")
        console.log("🔍 chrome.runtime.lastError:", chrome.runtime.lastError)
        console.log("🔍 token received:", !!token)

        if (chrome.runtime.lastError) {
          const errorMsg = `Auth token error: ${chrome.runtime.lastError.message}`
          console.error("❌", errorMsg)
          setError(errorMsg)
          setIsLoading(false)
          return
        }

        if (!token) {
          const errorMsg = "No token received from chrome.identity"
          console.error("❌", errorMsg)
          setError(errorMsg)
          setIsLoading(false)
          return
        }

        console.log("✅ Token received, creating Firebase credential...")

        try {
          const credential = GoogleAuthProvider.credential(null, token)
          console.log("📞 Signing in with Firebase...")
          await signInWithCredential(auth, credential)
          console.log("✅ Firebase sign in successful!")
        } catch (e) {
          const errorMsg = `Firebase sign in error: ${e.message}`
          console.error("❌", errorMsg, e)
          setError(errorMsg)
          setIsLoading(false)
        }
      }
    )
  }

  // Test function to check chrome.identity without Firebase
  const testChromeIdentity = () => {
    console.log("🧪 Testing chrome.identity directly...")

    if (!chrome.identity) {
      console.error("❌ chrome.identity not available")
      return
    }

    chrome.identity.getAuthToken(
      {
        interactive: true,
        scopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile"
        ]
      },
      function (token) {
        console.log("🧪 Test result:")
        console.log("  - Token:", token ? "✅ Received" : "❌ None")
        console.log("  - Error:", chrome.runtime.lastError?.message || "None")

        if (token) {
          // Test API call with the token
          fetch(
            `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`
          )
            .then((response) => response.json())
            .then((data) => {
              console.log("✅ User info from Google API:", data)
            })
            .catch((err) => {
              console.error("❌ Failed to fetch user info:", err)
            })
        }
      }
    )
  }

  useEffect(() => {
    console.log("🔍 Setting up auth state listener...")
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log(
        "🔄 Auth state changed:",
        user ? "User logged in" : "User logged out"
      )
      setIsLoading(false)
      setUser(user)
      setError(null)
    })

    return unsubscribe
  }, [])

  return {
    isLoading,
    user,
    firestore,
    onLogin,
    onLogout,
    error,
    testChromeIdentity // Add this for debugging
  }
}
