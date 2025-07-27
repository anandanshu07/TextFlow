import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";



import { useFirebase } from "~firebase/hook";





// Global state for snippets
let globalSnippets: Record<string, string> = {
  "/email": "deevee47@gmail.com",
  "/phone": "+91-9876543210",
  "/name": "Divyansh Vishwakarma"
}

// Enhanced logging function
const log = (message: string, data?: any) => {
  console.log(`[QuickType] ${message}`, data || "")
}

// Main Content Script Component
const QuickTypeContent = () => {
  const { user, isLoading, firestore } = useFirebase()
  const [snippets, setSnippets] = useState(globalSnippets)
  const [isInitialized, setIsInitialized] = useState(false)
  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)

  // Load snippets from Firebase
  const loadSnippetsFromFirebase = async () => {
    if (!user || !firestore) {
      log("❌ Cannot load snippets - missing user or firestore", {
        user: !!user,
        firestore: !!firestore
      })
      return
    }

    try {
      console.log("📥 Loading snippets from Firebase for user:", user.email)
      console.log("🔍 User UID:", user.uid)

      const userItemsRef = collection(
        firestore,
        "quickTypeItems",
        user.uid,
        "items"
      )

      console.log("📂 Collection path:", `quickTypeItems/${user.uid}/items`)

      // Try multiple approaches to find the data
      let items: any[] = []

      // Approach 1: Simple collection fetch (most reliable)
      try {
        console.log("🔍 Trying simple collection fetch...")
        const snapshot = await getDocs(userItemsRef)
        console.log(`📄 Found ${snapshot.size} documents in collection`)

        if (!snapshot.empty) {
          items = snapshot.docs.map((doc) => {
            const data = doc.data()
            console.log(`📝 Document ${doc.id}:`, data)
            return {
              id: doc.id,
              ...data
            }
          })
          console.log("✅ Raw items from simple fetch:", items)
        }
      } catch (simpleError) {
        console.log("❌ Simple fetch failed:", simpleError)
      }

      // Approach 2: Try with query if simple fetch didn't work or returned empty
      if (items.length === 0) {
        try {
          log("🔍 Trying query with where clause...")
          const q = query(
            userItemsRef,
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
          )
          const snapshot = await getDocs(q)
          log(`📄 Query found ${snapshot.size} documents`)

          if (!snapshot.empty) {
            items = snapshot.docs.map((doc) => {
              const data = doc.data()
              log(`📝 Query document ${doc.id}:`, data)
              return {
                id: doc.id,
                ...data
              }
            })
            log("✅ Raw items from query:", items)
          }
        } catch (queryError) {
          log("❌ Query failed:", queryError)
        }
      }

      // Approach 3: Try different collection structures
      if (items.length === 0) {
        try {
          log("🔍 Trying alternative collection structure...")
          const altRef = collection(firestore, "quickTypeItems")
          const altQuery = query(altRef, where("userId", "==", user.uid))
          const snapshot = await getDocs(altQuery)
          log(`📄 Alternative structure found ${snapshot.size} documents`)

          if (!snapshot.empty) {
            items = snapshot.docs.map((doc) => {
              const data = doc.data()
              log(`📝 Alt document ${doc.id}:`, data)
              return {
                id: doc.id,
                ...data
              }
            })
            log("✅ Raw items from alternative structure:", items)
          }
        } catch (altError) {
          log("❌ Alternative structure failed:", altError)
        }
      }

      if (items.length > 0) {
        console.log(`🎉 Successfully loaded ${items.length} items from Firebase`)
        updateSnippetsFromItems(items)
      } else {
        log(
          "ℹ️ No Firebase snippets found in any structure, keeping current snippets"
        )
        log("💡 Current snippets will remain:", snippets)
      }
    } catch (error) {
      console.log("❌ Error loading snippets from Firebase:", error)
      log("📊 Error details:", {
        name: error.name,
        message: error.message,
        code: error.code
      })
    }
  }

  // Update snippets from Firebase items
  const updateSnippetsFromItems = (items: any[]) => {
    log("🔄 Processing Firebase items to update snippets...")
    log("📥 Raw items received:", items)

    // Start with current snippets (including hardcoded defaults)
    const newSnippets: Record<string, string> = { ...globalSnippets }
    log("📋 Starting with current snippets:", newSnippets)

    let processedCount = 0

    items.forEach((item: any, index: number) => {
      log(`📝 Processing item ${index + 1}:`, item)

      // Try different possible field names for keyword and value
      const possibleKeywordFields = ["keyword", "shortcut", "trigger", "key"]
      const possibleValueFields = [
        "value",
        "text",
        "content",
        "replacement",
        "expansion"
      ]

      let keyword = null
      let value = null

      // Find keyword field
      for (const field of possibleKeywordFields) {
        if (item[field]) {
          keyword = item[field]
          log(`✅ Found keyword in field '${field}':`, keyword)
          break
        }
      }

      // Find value field
      for (const field of possibleValueFields) {
        if (item[field]) {
          value = item[field]
          log(`✅ Found value in field '${field}':`, value)
          break
        }
      }

      if (keyword && value) {
        // Ensure keyword starts with / if it doesn't already
        const formattedKeyword = keyword.startsWith("/")
          ? keyword
          : `/${keyword}`

        newSnippets[formattedKeyword] = value
        processedCount++
        log(`✅ Added snippet: "${formattedKeyword}" -> "${value}"`)
      } else {
        log(`⚠️ Skipping item ${index + 1} - missing required fields`, {
          keyword: keyword,
          value: value,
          availableFields: Object.keys(item)
        })
      }
    })

    log(`🎯 Processed ${processedCount} out of ${items.length} items`)
    log("📊 Final snippets object:", newSnippets)

    // Update global and component state
    globalSnippets = newSnippets
    setSnippets(newSnippets)

    log("✅ Snippets updated successfully!")
    log(`📈 Total snippets now: ${Object.keys(newSnippets).length}`)
  }

  // Initialize when user changes
  useEffect(() => {
    log("🔄 Initialization effect triggered", {
      isLoading,
      user: !!user,
      firestore: !!firestore
    })

    if (!isLoading) {
      if (user && firestore) {
        log("👤 User authenticated, loading snippets...")
        loadSnippetsFromFirebase()
        setIsInitialized(true)
      } else if (user === null) {
        log("🚫 User logged out, using default snippets")
        globalSnippets = {
          "/email": "deevee47@gmail.com",
          "/phone": "+91-9876543210",
          "/name": "Divyansh Vishwakarma"
        }
        setSnippets(globalSnippets)
        setIsInitialized(true)
      }
    }
  }, [user, isLoading, firestore])

  // Toast notification system
  const createToast = (message: string) => {
    if (document.querySelector(".quicktype-toast")) {
      return
    }

    try {
      playNotificationSound()
    } catch (error) {
      log("🔇 Audio unavailable:", error)
    }

    const wrapper = document.createElement("div")
    wrapper.className = "quicktype-toast"
    Object.assign(wrapper.style, {
      position: "fixed",
      top: "30px",
      right: "30px",
      zIndex: "999999",
      pointerEvents: "none"
    })

    const toast = document.createElement("div")
    const iconSVG = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#10b981"/>
      </svg>
    `

    const text = document.createElement("span")
    text.textContent = message
    text.style.fontSize = "14px"

    const accentBar = document.createElement("div")

    toast.innerHTML = iconSVG
    toast.appendChild(text)
    toast.appendChild(accentBar)

    const toastDuration = 2000

    Object.assign(toast.style, {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "12px 16px",
      backgroundColor: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "14px",
      fontWeight: "500",
      color: "#374151",
      borderRadius: "8px",
      borderTopRightRadius: "0px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      border: "1px solid #e5e7eb",
      overflow: "hidden",
      opacity: "0",
      transform: "translateX(20px)",
      transition: "all 0.3s ease"
    })

    Object.assign(accentBar.style, {
      position: "absolute",
      bottom: "0",
      left: "0",
      height: "3px",
      width: "100%",
      backgroundColor: "#10b981",
      transition: `width ${toastDuration}ms linear`
    })

    wrapper.appendChild(toast)
    document.body.appendChild(wrapper)

    setTimeout(() => {
      toast.style.opacity = "1"
      toast.style.transform = "translateX(0)"
      accentBar.style.width = "0%"
    }, 10)

    setTimeout(() => {
      toast.style.opacity = "0"
      toast.style.transform = "translateX(20px)"
      setTimeout(() => {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper)
        }
      }, 300)
    }, toastDuration)
  }

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)()
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(650, ctx.currentTime)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)

      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.2)
    } catch (error) {
      // Audio not available, silently fail
    }
  }

  // Process input with snippet replacement
  const processInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
    log("🔍 Processing input", {
      value: target.value,
      type: target.type,
      tagName: target.tagName,
      id: target.id,
      className: target.className
    })

    if (!target.value) {
      log("⏭️ Skipping - no value")
      return
    }

    // Skip password fields and hidden inputs
    if (target.type === "password" || target.type === "hidden") {
      log("⏭️ Skipping - password/hidden field")
      return
    }

    let originalValue = target.value
    let newValue = originalValue
    let hasReplacement = false
    let replacedKeywords: string[] = []

    // Process each snippet
    for (const [keyword, replacement] of Object.entries(snippets)) {
      if (newValue.includes(keyword)) {
        newValue = newValue.replace(
          new RegExp(escapeRegExp(keyword), "g"),
          replacement
        )
        hasReplacement = true
        replacedKeywords.push(keyword)

        log(`🔄 Replaced "${keyword}" with "${replacement}"`)
      }
    }

    if (hasReplacement) {
      log("✅ Applying replacement", { originalValue, newValue })

      // Store original selection
      const cursorPosition = target.selectionStart || 0
      const cursorEnd = target.selectionEnd || 0

      // Update the field value
      target.value = newValue

      // Calculate new cursor position
      const lengthDiff = newValue.length - originalValue.length
      const newCursorPosition = Math.max(0, cursorPosition + lengthDiff)
      const newCursorEnd = Math.max(0, cursorEnd + lengthDiff)

      // Restore cursor position
      setTimeout(() => {
        try {
          target.setSelectionRange(newCursorPosition, newCursorEnd)
          target.focus()
        } catch (e) {
          log("⚠️ Could not set cursor position:", e)
        }
      }, 0)

      // Trigger events for React and other frameworks
      const events = [
        new Event("input", { bubbles: true, cancelable: true }),
        new Event("change", { bubbles: true, cancelable: true }),
        new Event("keyup", { bubbles: true, cancelable: true }),
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: newValue
        })
      ]

      events.forEach((event) => {
        try {
          target.dispatchEvent(event)
        } catch (e) {
          log("⚠️ Event dispatch failed:", e)
        }
      })

      // Try React's synthetic event pattern
      try {
        const nativeSetter =
          target instanceof HTMLInputElement
            ? Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
              )?.set
            : Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value"
              )?.set

        if (nativeSetter) {
          nativeSetter.call(target, newValue)

          const syntheticEvent = new Event("input", { bubbles: true })
          Object.defineProperty(syntheticEvent, "target", {
            writable: false,
            value: target
          })
          target.dispatchEvent(syntheticEvent)
        }
      } catch (e) {
        log("⚠️ React synthetic event failed:", e)
      }

      // Show toast for the first replaced keyword
      if (replacedKeywords.length > 0) {
        const keyword = replacedKeywords[0]
        const replacement = snippets[keyword]
        const displayText =
          replacement.length > 30
            ? replacement.substring(0, 30) + "..."
            : replacement
        createToast(`${keyword} → ${displayText}`)
      }
    } else {
      log("⏭️ No replacements needed")
    }
  }

  // Check if element is a valid input
  const isValidInput = (
    element: Element
  ): element is HTMLInputElement | HTMLTextAreaElement => {
    if (!element) return false

    const tagName = element.tagName.toLowerCase()
    if (tagName === "textarea") return true

    if (tagName === "input") {
      const inputType = (element as HTMLInputElement).type.toLowerCase()
      const validTypes = ["text", "email", "url", "search", "tel", "password"]
      return validTypes.includes(inputType)
    }

    // Check for contenteditable
    const isContentEditable =
      element.getAttribute("contenteditable") === "true" ||
      element.getAttribute("contenteditable") === ""

    return isContentEditable
  }

  // Handle contenteditable elements
  const processContentEditable = (element: Element) => {
    if (!element.textContent) return

    log("🔍 Processing contenteditable", {
      textContent: element.textContent,
      innerHTML: element.innerHTML
    })

    let originalText = element.textContent
    let newText = originalText
    let hasReplacement = false

    for (const [keyword, replacement] of Object.entries(snippets)) {
      if (newText.includes(keyword)) {
        newText = newText.replace(
          new RegExp(escapeRegExp(keyword), "g"),
          replacement
        )
        hasReplacement = true
        log(`🔄 Replaced "${keyword}" with "${replacement}" in contenteditable`)
      }
    }

    if (hasReplacement) {
      // Save cursor position
      const selection = window.getSelection()
      const range = selection?.getRangeAt(0)
      const cursorOffset = range?.startOffset || 0

      // Update text content
      element.textContent = newText

      // Restore cursor
      setTimeout(() => {
        try {
          const newRange = document.createRange()
          const textNode = element.firstChild
          if (textNode) {
            const newOffset = Math.min(
              cursorOffset + (newText.length - originalText.length),
              newText.length
            )
            newRange.setStart(textNode, Math.max(0, newOffset))
            newRange.setEnd(textNode, Math.max(0, newOffset))
            selection?.removeAllRanges()
            selection?.addRange(newRange)
          }
        } catch (e) {
          log("⚠️ Could not restore cursor in contenteditable:", e)
        }
      }, 0)

      // Trigger input events
      const inputEvent = new Event("input", { bubbles: true })
      element.dispatchEvent(inputEvent)
    }
  }

  // Multiple detection strategies
  useEffect(() => {
    if (!isInitialized) return

    log("🎧 Setting up comprehensive input detection", {
      snippetsCount: Object.keys(snippets).length
    })

    // Strategy 1: Traditional event listeners
    const handleEvent = (e: Event) => {
      const target = e.target as HTMLElement

      if (!target) return

      log(`📝 Event detected: ${e.type}`, {
        target: target.tagName,
        id: target.id,
        className: target.className,
        type: (target as any).type
      })

      if (isValidInput(target)) {
        if (
          target.tagName.toLowerCase() !== "input" &&
          target.tagName.toLowerCase() !== "textarea"
        ) {
          // Handle contenteditable
          processContentEditable(target)
        } else {
          // Handle regular inputs
          if (inputTimeoutRef.current) {
            clearTimeout(inputTimeoutRef.current)
          }

          inputTimeoutRef.current = setTimeout(() => {
            processInput(target as HTMLInputElement | HTMLTextAreaElement)
          }, 150)
        }
      }
    }

    const eventTypes = ["input", "keyup", "keydown", "paste", "blur", "change"]

    eventTypes.forEach((eventType) => {
      document.addEventListener(eventType, handleEvent, true)
    })

    // Strategy 2: Focus tracking
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (isValidInput(target)) {
        focusedElementRef.current = target
        log("👁️ Input focused", {
          target: target.tagName,
          id: target.id,
          type: (target as any).type
        })
      }
    }

    document.addEventListener("focus", handleFocus, true)

    // Strategy 3: Mutation Observer for dynamically added inputs
    observerRef.current = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element

            // Check if the added node itself is an input
            if (isValidInput(element)) {
              log("🆕 New input detected via mutation observer", {
                target: element.tagName,
                id: element.id
              })
            }

            // Check for inputs within the added node
            const inputs = element.querySelectorAll(
              'input, textarea, [contenteditable="true"], [contenteditable=""]'
            )
            if (inputs.length > 0) {
              log(`🆕 ${inputs.length} new inputs found in added content`)
            }
          }
        })
      })
    })

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true
    })

    // Strategy 4: Polling for focused element (backup)
    const pollFocusedElement = () => {
      const activeElement = document.activeElement as HTMLElement
      if (
        activeElement &&
        isValidInput(activeElement) &&
        activeElement !== focusedElementRef.current
      ) {
        focusedElementRef.current = activeElement
        log("🔍 Polling detected new focused input", {
          target: activeElement.tagName,
          id: activeElement.id
        })
      }
    }

    const pollInterval = setInterval(pollFocusedElement, 1000)

    // Strategy 5: Manual checking of all inputs periodically
    const checkAllInputs = () => {
      const allInputs = document.querySelectorAll(
        'input, textarea, [contenteditable="true"], [contenteditable=""]'
      )
      log(`🔄 Periodic check found ${allInputs.length} total inputs on page`)
    }

    const checkInterval = setInterval(checkAllInputs, 10000)

    return () => {
      log("🛑 Removing all input detection strategies")

      // Remove event listeners
      eventTypes.forEach((eventType) => {
        document.removeEventListener(eventType, handleEvent, true)
      })
      document.removeEventListener("focus", handleFocus, true)

      // Clear timeouts
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current)
      }
      clearInterval(pollInterval)
      clearInterval(checkInterval)

      // Disconnect observer
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [snippets, isInitialized])

  // Utility function to escape regex special characters
  const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  // Enhanced debug functions
  useEffect(() => {
    ;(window as any).quickTypeDebug = () => {
      console.group("🐛 QuickType Debug Info")
      console.log("- Initialized:", isInitialized)
      console.log("- Loading:", isLoading)
      console.log("- Current user:", user?.email || "Not logged in")
      console.log("- Current snippets:", snippets)
      console.log("- Firestore:", !!firestore)
      console.log("- Global snippets:", globalSnippets)
      console.log("- Currently focused element:", focusedElementRef.current)

      // Count inputs on page
      const allInputs = document.querySelectorAll(
        'input, textarea, [contenteditable="true"], [contenteditable=""]'
      )
      console.log(`- Total inputs on page: ${allInputs.length}`)

      allInputs.forEach((input, index) => {
        console.log(
          `  ${index + 1}. ${input.tagName} - id: ${input.id || "none"} - type: ${(input as any).type || "none"}`
        )
      })

      console.groupEnd()
    }
    ;(window as any).quickTypeTest = () => {
      log("🧪 Creating test input")

      const testInput = document.createElement("input")
      testInput.type = "text"
      testInput.value = ""
      testInput.placeholder = "Type '/email' or '/phone' to test"
      testInput.style.position = "fixed"
      testInput.style.top = "10px"
      testInput.style.left = "10px"
      testInput.style.zIndex = "999999"
      testInput.style.padding = "10px"
      testInput.style.border = "2px solid red"
      testInput.style.borderRadius = "4px"
      testInput.style.backgroundColor = "white"
      testInput.style.minWidth = "300px"
      testInput.style.fontSize = "14px"

      document.body.appendChild(testInput)
      testInput.focus()

      // Auto-type for testing
      setTimeout(() => {
        testInput.value = "My email is /email"
        const inputEvent = new Event("input", { bubbles: true })
        testInput.dispatchEvent(inputEvent)
      }, 1000)

      // Remove after 15 seconds
      setTimeout(() => {
        if (testInput.parentNode) {
          testInput.parentNode.removeChild(testInput)
          log("🗑️ Test input removed")
        }
      }, 15000)
    }
    ;(window as any).quickTypeReload = () => {
      if (user && firestore) {
        log("🔄 Manually reloading snippets...")
        loadSnippetsFromFirebase()
      } else {
        log("❌ No user logged in")
      }
    }
    ;(window as any).quickTypeStatus = () => {
      return {
        initialized: isInitialized,
        loading: isLoading,
        user: user?.email || null,
        snippetsCount: Object.keys(snippets).length,
        snippets: snippets,
        hasFirestore: !!firestore,
        focusedElement: focusedElementRef.current?.tagName || null,
        totalInputsOnPage: document.querySelectorAll(
          'input, textarea, [contenteditable="true"], [contenteditable=""]'
        ).length
      }
    }
    ;(window as any).quickTypeFirebaseTest = async () => {
      if (!user || !firestore) {
        console.log("❌ No user or firestore available")
        return
      }

      console.group("🔥 Firebase Test Results")

      try {
        // Test 1: Check user info
        console.log("👤 User info:", {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        })

        // Test 2: Try to read from different possible collection structures
        const structures = [
          `quickTypeItems/${user.uid}/items`,
          `quickTypeItems`,
          `users/${user.uid}/snippets`,
          `users/${user.uid}/quicktype`,
          `snippets`
        ]

        for (const structure of structures) {
          try {
            console.log(`🔍 Testing structure: ${structure}`)

            let ref
            let query_ref = null

            if (structure.includes("/")) {
              const parts = structure.split("/")
              if (parts.length === 3) {
                ref = collection(firestore, parts[0], parts[1], parts[2])
              } else {
                ref = collection(firestore, structure)
              }
            } else {
              ref = collection(firestore, structure)
              // For top-level collections, try with userId filter
              query_ref = query(ref, where("userId", "==", user.uid))
            }

            // Try simple fetch first
            const snapshot = await getDocs(ref)
            console.log(
              `📄 ${structure} - Simple fetch: ${snapshot.size} documents`
            )

            if (snapshot.size > 0) {
              snapshot.docs.forEach((doc, index) => {
                console.log(`  Document ${index + 1} (${doc.id}):`, doc.data())
              })
            }

            // Try with query if available
            if (query_ref) {
              const querySnapshot = await getDocs(query_ref)
              console.log(
                `📄 ${structure} - With userId query: ${querySnapshot.size} documents`
              )

              if (querySnapshot.size > 0) {
                querySnapshot.docs.forEach((doc, index) => {
                  console.log(
                    `  Query Document ${index + 1} (${doc.id}):`,
                    doc.data()
                  )
                })
              }
            }
          } catch (structureError) {
            console.log(`❌ ${structure} failed:`, structureError.message)
          }
        }

        // Test 3: Manual reload
        console.log("🔄 Attempting manual reload...")
        await loadSnippetsFromFirebase()
      } catch (error) {
        console.error("❌ Firebase test failed:", error)
      }

      console.groupEnd()
    }
    ;(window as any).quickTypeManualAdd = (keyword: string, value: string) => {
      const formattedKeyword = keyword.startsWith("/") ? keyword : `/${keyword}`
      globalSnippets[formattedKeyword] = value
      setSnippets({ ...globalSnippets })
      console.log(`✅ Manually added: ${formattedKeyword} -> ${value}`)
      console.log("Current snippets:", globalSnippets)
    }

    // Auto-run debug on initialization
    if (isInitialized && !isLoading) {
      log("✅ QuickType fully initialized with comprehensive detection!")
      setTimeout(() => {
        ;(window as any).quickTypeDebug()
      }, 1000)
    }
  }, [user, firestore, snippets, isInitialized, isLoading])

  return null
}

// Initialize the content script
const init = () => {
  log("🚀 QuickType React content script loading...")

  if (document.getElementById("quicktype-content-script")) {
    log("⚠️ QuickType already initialized, skipping...")
    return
  }

  try {
    const container = document.createElement("div")
    container.id = "quicktype-content-script"
    container.style.display = "none"
    document.body.appendChild(container)

    const root = createRoot(container)
    root.render(<QuickTypeContent />)

    log("✅ QuickType React content script loaded!")
    log("💡 Available debug commands:")
    log("  - quickTypeDebug() - Show debug info and count inputs")
    log("  - quickTypeTest() - Create test input with auto-typing")
    log("  - quickTypeStatus() - Get current status")
    log("  - quickTypeForceProcess() - Force process active element")
  } catch (error) {
    log("❌ Error initializing QuickType:", error)
  }
}

// Enhanced initialization
const initWithRetry = (attempt = 1, maxAttempts = 5) => {
  if (attempt > maxAttempts) {
    log("❌ Failed to initialize after multiple attempts")
    return
  }

  try {
    if (document.body) {
      init()
    } else {
      log(`⏳ Body not ready, retrying... (attempt ${attempt}/${maxAttempts})`)
      setTimeout(() => initWithRetry(attempt + 1, maxAttempts), 200)
    }
  } catch (error) {
    log(`❌ Init attempt ${attempt} failed:`, error)
    if (attempt < maxAttempts) {
      setTimeout(() => initWithRetry(attempt + 1, maxAttempts), 1000)
    }
  }
}

// Multiple initialization strategies
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initWithRetry())
} else {
  initWithRetry()
}

// Also try after a delay for SPAs
setTimeout(() => {
  if (!document.getElementById("quicktype-content-script")) {
    log("🔄 Delayed initialization for SPA")
    initWithRetry()
  }
}, 2000)

export {}