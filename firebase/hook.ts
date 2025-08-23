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
    setIsLoading(true)
    setError(null)

    // Check if chrome.identity is available
    if (!chrome.identity) {
      const errorMsg = "chrome.identity is not available"
      setError(errorMsg)
      setIsLoading(false)
      return
    }

    chrome.identity.getAuthToken(
      {
        interactive: true
      },
      async function (token) {
        if (chrome.runtime.lastError) {
          const errorMsg = `Auth token error: ${chrome.runtime.lastError.message}`
          setError(errorMsg)
          setIsLoading(false)
          return
        }

        if (!token) {
          const errorMsg = "No token received from chrome.identity"
          setError(errorMsg)
          setIsLoading(false)
          return
        }

        try {
          const credential = GoogleAuthProvider.credential(null, token)
          await signInWithCredential(auth, credential)
        } catch (e) {
          const errorMsg = `Firebase sign in error: ${e.message}`
          setError(errorMsg)
          setIsLoading(false)
        }
      }
    )
  }

  // Test function to check chrome.identity without Firebase
  const testChromeIdentity = () => {
    if (!chrome.identity) {
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
        if (token) {
          // Test API call with the token
          fetch(
            `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`
          )
            .then((response) => response.json())
            .then((data) => {
              // User info received
            })
            .catch((err) => {
              // Failed to fetch user info
            })
        }
      }
    )
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
