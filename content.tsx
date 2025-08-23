import React, { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

// Global state for snippets
let globalSnippets: Record<string, string> = {
  "/email": "Please Login Quick Type Chrome Extension"
}

// Enhanced logging function - removed console logs
const log = (message: string, data?: any) => {
  // Console logs removed
}

// Main Content Script Component
const QuickTypeContent = () => {
  const [snippets, setSnippets] = useState(globalSnippets)
  const [isInitialized, setIsInitialized] = useState(false)
  const [user, setUser] = useState(null)
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({})
  const [isCheckingAuth, setIsCheckingAuth] = useState(true) // Add auth checking state
  const usageCountsRef = useRef<Record<string, number>>({}) // Immediate reference for usage counts
  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sync usageCountsRef with usageCounts state
  useEffect(() => {
    usageCountsRef.current = usageCounts
  }, [usageCounts])

  // Load snippets from background script
  const loadSnippetsFromBackground = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_SNIPPETS"
      })

      if (response.snippets && Object.keys(response.snippets).length > 0) {
        globalSnippets = response.snippets
        setSnippets(response.snippets)

        // Load usage metadata if available
        if (response.snippetsWithMetadata) {
          const usageData: Record<string, number> = {}
          response.snippetsWithMetadata.forEach((item: any) => {
            usageData[item.keyword] = item.usageCount || 0
          })
          setUsageCounts(usageData)
          usageCountsRef.current = usageData // Also update ref
        }
      } else {
      }
    } catch (error) {
      log("❌ Error loading snippets from background:", error)
    }
  }

  // Increment usage count for a keyword
  const incrementUsageCount = async (keyword: string) => {
    try {
      await chrome.runtime.sendMessage({
        type: "INCREMENT_USAGE",
        keyword: keyword
      })
      log(`📈 Usage count incremented for: ${keyword}`)
    } catch (error) {
      log("❌ Error incrementing usage count:", error)
    }
  }

  // Get user state from background script with retry mechanism
  const getUserState = async (retryCount = 0) => {
    try {
      log(`🔍 Getting user state (attempt ${retryCount + 1})`)
      const response = await chrome.runtime.sendMessage({ type: "GET_USER" })

      setUser(response.user)
      setIsCheckingAuth(false)

      if (response.user) {
        log("👤 User authenticated:", response.user.email)
        if (response.snippets && Object.keys(response.snippets).length > 0) {
          log("✅ User snippets loaded:", response.snippets)
          globalSnippets = response.snippets
          setSnippets(response.snippets)

          // Load usage metadata if available
          if (response.snippetsWithMetadata) {
            const usageData: Record<string, number> = {}
            response.snippetsWithMetadata.forEach((item: any) => {
              usageData[item.keyword] = item.usageCount || 0
            })
            setUsageCounts(usageData)
            usageCountsRef.current = usageData // Also update ref
          }
        }
      } else {
        // If no user and we haven't retried enough, try again after a delay
        // This helps catch cases where the background script is still initializing
        if (retryCount < 3) {
          log(
            `⏳ Retrying user state check in 2 seconds... (${retryCount + 1}/3)`
          )
          authCheckTimeoutRef.current = setTimeout(() => {
            getUserState(retryCount + 1)
          }, 2000)
          return // Don't set isCheckingAuth to false yet
        }
      }
    } catch (error) {
      log("❌ Error getting user state:", error)
      setIsCheckingAuth(false)

      // Retry on error too, but only a few times
      if (retryCount < 2) {
        log(`⏳ Retrying after error in 3 seconds... (${retryCount + 1}/2)`)
        authCheckTimeoutRef.current = setTimeout(() => {
          getUserState(retryCount + 1)
        }, 3000)
      }
    }
  }

  // Initialize when component mounts
  useEffect(() => {
    // Get initial user state with retry mechanism
    getUserState()

    // Listen for messages from background script
    const handleMessage = (message: any) => {
      log("📨 Message received from background:", message.type)

      switch (message.type) {
        case "USER_LOGIN":
          setUser(message.user)
          setIsCheckingAuth(false)
          if (message.snippets) {
            globalSnippets = message.snippets
            setSnippets(message.snippets)

            // Load usage metadata if available
            if (message.snippetsWithMetadata) {
              const usageData: Record<string, number> = {}
              message.snippetsWithMetadata.forEach((item: any) => {
                usageData[item.keyword] = item.usageCount || 0
              })
              setUsageCounts(usageData)
              usageCountsRef.current = usageData // Also update ref
            }
          }
          break

        case "USER_LOGOUT":
          setUser(null)
          setIsCheckingAuth(false)
          // Reset to default snippets
          globalSnippets = {
            "/email": "Please Login Quick Type Chrome Extension"
          }
          setSnippets(globalSnippets)
          setUsageCounts({})
          usageCountsRef.current = {}
          break

        case "USER_STATE_CHANGED":
          setUser(message.user)
          setIsCheckingAuth(false)
          if (message.user && message.snippets) {
            globalSnippets = message.snippets
            setSnippets(message.snippets)

            if (message.snippetsWithMetadata) {
              const usageData: Record<string, number> = {}
              message.snippetsWithMetadata.forEach((item: any) => {
                usageData[item.keyword] = item.usageCount || 0
              })
              setUsageCounts(usageData)
              usageCountsRef.current = usageData
              log("📊 State change usage counts loaded:", usageData)
            }
          } else if (!message.user) {
            // User logged out
            globalSnippets = {
              "/email": "Please Login Quick Type Chrome Extension"
            }
            setSnippets(globalSnippets)
            setUsageCounts({})
            usageCountsRef.current = {}
          }
          break

        case "SNIPPETS_UPDATED":
          if (message.snippets) {
            globalSnippets = message.snippets
            setSnippets(message.snippets)
          }
          // Also update usage counts if metadata is provided
          if (message.snippetsWithMetadata) {
            const usageData: Record<string, number> = {}
            message.snippetsWithMetadata.forEach((item: any) => {
              usageData[item.keyword] = item.usageCount || 0
            })
            setUsageCounts(usageData)
            usageCountsRef.current = usageData // Also update ref
          }
          break

        case "USAGE_UPDATED":
          // Update local usage counts for toast display
          // Only update if the received count is higher than our current count (avoid overwriting optimistic updates)
          setUsageCounts((prev) => {
            const newCounts = {
              ...prev,
              [message.keyword]: Math.max(
                prev[message.keyword] || 0,
                message.usageCount
              )
            }
            usageCountsRef.current = newCounts // Also update ref
            return newCounts
          })

          break

        default:
          log("❓ Unknown message type:", message.type)
      }
    }

    // Add message listener
    chrome.runtime.onMessage.addListener(handleMessage)

    // Mark as initialized
    setIsInitialized(true)

    return () => {
      // Cleanup message listener and timeouts
      chrome.runtime.onMessage.removeListener(handleMessage)
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current)
      }
    }
  }, [])

  // Initialize Audio Context on first user interaction
  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)()
      } catch (error) {
        log("❌ Failed to initialize audio context:", error)
      }
    }
  }

  // Enhanced click-like notification sound
  // Notification pop sound
  // Notification pop sound - Bolder and Louder
  const playNotificationSound = async () => {
    try {
      initializeAudioContext()

      if (!audioContextRef.current) {
        log("🔇 Audio context not available")
        return
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      const ctx = audioContextRef.current
      const now = ctx.currentTime
      const volume = 0.35 // Increased volume

      // 1. Create the Main Sound Source (Triangle Wave)
      // A triangle wave sounds richer and less sharp than a sine wave.
      const mainOscillator = ctx.createOscillator()
      mainOscillator.type = "triangle"
      // Lowered frequency to 650Hz to make it less shrill.
      mainOscillator.frequency.setValueAtTime(650, now)

      // 2. Create a Bass Layer for "Body" (Sine Wave)
      // This adds a low-end "thump" to make the pop feel more bold.
      const bassOscillator = ctx.createOscillator()
      bassOscillator.type = "sine"
      bassOscillator.frequency.setValueAtTime(120, now)

      // 3. Create the Volume Envelope (GainNode)
      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01)
      // Slightly longer decay for a fuller sound.
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

      // 4. Connect everything and play
      // Both oscillators connect to the same gain node.
      mainOscillator.connect(gainNode)
      bassOscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      mainOscillator.start(now)
      bassOscillator.start(now)
      mainOscillator.stop(now + 0.1)
      bassOscillator.stop(now + 0.1)

      log("🔊 Bolder pop notification sound played")
    } catch (error) {
      log("🔇 Audio playback failed:", error)
    }
  }

  // Dark UI themed toast notification system
  const createToast = (message: string, usageCount?: number) => {
    // Remove existing toast if present
    const existingToast = document.querySelector(".quicktype-toast-wrapper")
    if (existingToast) {
      existingToast.remove()
    }

    // Play sound first
    playNotificationSound()

    const wrapper = document.createElement("div")
    wrapper.className = "quicktype-toast-wrapper"

    // Enhanced positioning matching your dark UI theme
    Object.assign(wrapper.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483647", // Maximum z-index value
      pointerEvents: "none",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'figtree'"
    })

    const toast = document.createElement("div")

    // Dark theme styling to match your login UI - more compact
    Object.assign(toast.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "12px 16px",
      backgroundColor: "#0a0a0f", // Same as your login background
      color: "#b6b9be", // Same as your login text color
      borderRadius: "10px",
      borderTopRightRadius: "0px",
      boxShadow:
        "0 20px 25px -5px rgba(182, 185, 190, 0.1), 0 10px 10px -5px rgba(182, 185, 190, 0.04), 0 0 0 1px rgba(182, 185, 190, 0.1)",
      border: "1px solid rgba(182, 185, 190, 0.1)", // Subtle border using your theme color
      backdropFilter: "blur(12px)",
      fontSize: "14px",
      fontWeight: "500",
      maxWidth: "280px",
      minWidth: "200px",
      opacity: "0",
      transform: "translateX(100%) scale(0.95)",
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      overflow: "hidden",
      position: "relative"
    })

    // Success icon SVG with your theme colors - smaller
    const iconSVG = `
      <div style="width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #b6b9be, #9ca3af); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 8px rgba(182, 185, 190, 0.2);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M9 12l2 2 4-4" stroke="#0a0a0f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `

    // Main content container with relative positioning for overlay
    const contentContainer = document.createElement("div")
    Object.assign(contentContainer.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      flex: "1",
      position: "relative",
      minHeight: "24px"
    })

    // Message text with proper styling and padding for overlay
    const textElement = document.createElement("span")
    textElement.textContent = message
    Object.assign(textElement.style, {
      fontSize: "13px",
      lineHeight: "1.3",
      marginTop: "1.5px",
      color: "#b6b9be",
      fontWeight: "500",
      letterSpacing: "-0.01em",
      paddingRight: usageCount ? "60px" : "0", // Space for usage badge
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: usageCount ? "200px" : "220px", // Fixed width to ensure usage count is visible
      display: "block" // Ensure the maxWidth is respected
    })

    // Usage count badge overlay (positioned absolutely)
    const usageBadge = document.createElement("div")
    const timesUsed = usageCount || 1 // Use the passed count directly, default to 1 for first use
    usageBadge.innerHTML = `
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" style="margin-right: 3px; display: inline-block; vertical-align: middle;">
        <path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 9l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span style="vertical-align: middle;">${timesUsed}</span>
    `
    Object.assign(usageBadge.style, {
      position: "absolute",
      top: "0",
      right: "0",
      fontSize: "10px",
      lineHeight: "1.2",
      color: "#b6b9be",
      opacity: "0.8",
      fontWeight: "500",
      background: "rgba(182, 185, 190, 0.15)",
      backdropFilter: "blur(8px)",
      padding: "2px 6px",
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      border: "1px solid rgba(182, 185, 190, 0.2)",
      height: "18px"
    })

    // Progress bar with theme colors
    const progressBar = document.createElement("div")
    Object.assign(progressBar.style, {
      position: "absolute",
      bottom: "0",
      left: "0",
      height: "2px",
      width: "100%",
      background: "linear-gradient(90deg, #b6b9be, #9ca3af)",
      borderRadius: "0 0 10px 10px",
      transformOrigin: "left",
      transform: "scaleX(1)",
      transition: "transform 3200ms linear",
      opacity: "0.8"
    })

    // Light rays effect overlay (subtle)
    const raysOverlay = document.createElement("div")
    Object.assign(raysOverlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      background:
        "radial-gradient(circle at 20% 20%, rgba(182, 185, 190, 0.03) 0%, transparent 50%)",
      borderRadius: "10px",
      pointerEvents: "none"
    })

    // Assemble the toast
    contentContainer.appendChild(textElement)
    if (usageCount) {
      contentContainer.appendChild(usageBadge)
    }

    toast.innerHTML = iconSVG
    toast.appendChild(contentContainer)
    toast.appendChild(progressBar)
    toast.appendChild(raysOverlay)
    wrapper.appendChild(toast)

    // Add to DOM
    document.body.appendChild(wrapper)

    // Animate in with your UI's smooth transitions
    requestAnimationFrame(() => {
      toast.style.opacity = "1"
      toast.style.transform = "translateX(0) scale(1)"

      // Start progress bar animation
      setTimeout(() => {
        progressBar.style.transform = "scaleX(0)"
      }, 150)
    })

    // Animate out and remove
    setTimeout(() => {
      toast.style.opacity = "0"
      toast.style.transform = "translateX(100%) scale(0.95)"

      setTimeout(() => {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper)
        }
      }, 400)
    }, 3200)

    log("🍞 Compact dark UI toast notification displayed:", message)
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
      return
    }

    // Skip password fields and hidden inputs
    if (target.type === "password" || target.type === "hidden") {
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
      }
    }

    if (hasReplacement) {
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

        // Calculate the new usage count using the ref for immediate access
        const currentUsage = usageCountsRef.current[keyword] || 0
        const newUsageCount = currentUsage + 1

        log(
          `🔍 Toast Debug - Keyword: ${keyword}, Current: ${currentUsage}, New: ${newUsageCount}`
        )

        // Immediately update both ref and state for all replaced keywords
        const updatedCounts: Record<string, number> = {}
        replacedKeywords.forEach((replacedKeyword) => {
          const currentUsage = usageCountsRef.current[replacedKeyword] || 0
          const newCount = currentUsage + 1
          updatedCounts[replacedKeyword] = newCount
          // Update ref immediately
          usageCountsRef.current[replacedKeyword] = newCount
        })

        // Update state for UI consistency
        setUsageCounts((prev) => ({
          ...prev,
          ...updatedCounts
        }))

        // Show toast with the new count
        createToast(`${keyword} → ${displayText}`, newUsageCount)

        // Increment usage count for all replaced keywords in background
        replacedKeywords.forEach((replacedKeyword) => {
          incrementUsageCount(replacedKeyword)
        })
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
    let replacedKeywords: string[] = []

    for (const [keyword, replacement] of Object.entries(snippets)) {
      if (newText.includes(keyword)) {
        newText = newText.replace(
          new RegExp(escapeRegExp(keyword), "g"),
          replacement
        )
        hasReplacement = true
        replacedKeywords.push(keyword)
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

      // Show toast for contenteditable replacements
      if (replacedKeywords.length > 0) {
        const keyword = replacedKeywords[0]
        const replacement = snippets[keyword]
        const displayText =
          replacement.length > 30
            ? replacement.substring(0, 30) + "..."
            : replacement

        // Calculate the new usage count using the ref for immediate access
        const currentUsage = usageCountsRef.current[keyword] || 0
        const newUsageCount = currentUsage + 1

        log(
          `🔍 Contenteditable Toast Debug - Keyword: ${keyword}, Current: ${currentUsage}, New: ${newUsageCount}`
        )

        // Immediately update both ref and state for all replaced keywords
        const updatedCounts: Record<string, number> = {}
        replacedKeywords.forEach((replacedKeyword) => {
          const currentUsage = usageCountsRef.current[replacedKeyword] || 0
          const newCount = currentUsage + 1
          updatedCounts[replacedKeyword] = newCount
          // Update ref immediately
          usageCountsRef.current[replacedKeyword] = newCount
        })

        // Update state for UI consistency
        setUsageCounts((prev) => ({
          ...prev,
          ...updatedCounts
        }))

        // Show toast with the new count
        createToast(`${keyword} → ${displayText}`, newUsageCount)

        // Increment usage count for all replaced keywords in background
        replacedKeywords.forEach((replacedKeyword) => {
          incrementUsageCount(replacedKeyword)
        })
      }
    }
  }

  // Multiple detection strategies
  useEffect(() => {
    if (!isInitialized) return

    log("🎧 Setting up comprehensive input detection", {
      snippetsCount: Object.keys(snippets).length
    })

    // Initialize audio context on first user interaction
    const initAudioOnInteraction = () => {
      initializeAudioContext()
      document.removeEventListener("click", initAudioOnInteraction)
      document.removeEventListener("keydown", initAudioOnInteraction)
    }

    document.addEventListener("click", initAudioOnInteraction, { once: true })
    document.addEventListener("keydown", initAudioOnInteraction, { once: true })

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
      document.removeEventListener("click", initAudioOnInteraction)
      document.removeEventListener("keydown", initAudioOnInteraction)

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
      // Debug info removed
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
    ;(window as any).quickTypeTestToast = () => {
      createToast("Test notification - this should appear!")
    }
    ;(window as any).quickTypeTestSound = () => {
      playNotificationSound()
    }
    ;(window as any).quickTypeReload = () => {
      loadSnippetsFromBackground()
    }
    ;(window as any).quickTypeStatus = () => {
      return {
        initialized: isInitialized,
        checkingAuth: isCheckingAuth,
        user: user?.email || null,
        snippetsCount: Object.keys(snippets).length,
        snippets: snippets,
        usageCounts: usageCounts,
        usageCountsRef: usageCountsRef.current,
        focusedElement: focusedElementRef.current?.tagName || null,
        audioContext: audioContextRef.current?.state || "Not initialized",
        totalInputsOnPage: document.querySelectorAll(
          'input, textarea, [contenteditable="true"], [contenteditable=""]'
        ).length
      }
    }
    ;(window as any).quickTypeManualAdd = (keyword: string, value: string) => {
      const formattedKeyword = keyword.startsWith("/") ? keyword : `/${keyword}`
      globalSnippets[formattedKeyword] = value
      setSnippets({ ...globalSnippets })
    }
    ;(window as any).quickTypeDebugStorage = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "DEBUG_STORAGE"
        })
        return response
      } catch (error) {
        // Storage debug failed
      }
    }
    ;(window as any).quickTypeClearStorage = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "CLEAR_STORAGE"
        })
        return response
      } catch (error) {
        // Clear storage failed
      }
    }
    ;(window as any).quickTypeTestLogin = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: "LOGIN" })
        return response
      } catch (error) {
        // Login test failed
      }
    }
    ;(window as any).quickTypeTestLogout = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: "LOGOUT" })
        return response
      } catch (error) {
        // Logout test failed
      }
    }

    // Auto-run debug on initialization
    if (isInitialized && !isCheckingAuth) {
      setTimeout(() => {
        ;(window as any).quickTypeDebug()
      }, 1000)
    }
  }, [user, snippets, isInitialized, isCheckingAuth])

  return null
}

// Initialize the content script
const init = () => {
  if (document.getElementById("quicktype-content-script")) {
    return
  }

  try {
    const container = document.createElement("div")
    container.id = "quicktype-content-script"
    container.style.display = "none"
    document.body.appendChild(container)

    const root = createRoot(container)
    root.render(<QuickTypeContent />)
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
