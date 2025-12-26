# Code Deep Dive - Implementation Details

> Line-by-line analysis of key functions across background.ts, popup.tsx, and content.tsx

---

## Table of Contents

1. [Background Script Functions](#background-script-functions)
2. [Popup UI Functions](#popup-ui-functions)
3. [Content Script Functions](#content-script-functions)
4. [Common Patterns](#common-patterns)
5. [Interview Q&A](#interview-qa)

---

## Background Script Functions

### 1. handleLogin() - OAuth Authentication

**Location:** `background.ts:469-533`

**Purpose:** Complete Google OAuth authentication flow

```typescript
const handleLogin = async () => {
  // 1. Prevent concurrent login attempts
  if (isLoading) {
    return { success: false, error: "Login already in progress" }
  }

  isLoading = true

  try {
    // 2. Check Firebase auth initialization
    if (!auth) {
      throw new Error("Firebase auth not properly initialized")
    }

    // 3. Check existing Firebase auth state
    const hasExistingAuth = await checkExistingAuth()
    if (hasExistingAuth) {
      isLoading = false
      return { success: true, alreadyAuthenticated: true }
    }

    // 4. Try stored token authentication
    const storedAuthSuccess = await tryAuthWithStoredToken()
    if (storedAuthSuccess) {
      isLoading = false
      return { success: true, usedStoredToken: true }
    }

    // 5. Check Chrome Identity API availability
    if (!chrome.identity) {
      throw new Error("Chrome identity API not available")
    }

    // 6. Interactive OAuth flow
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        try {
          // 7. Handle errors
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message)
          }

          if (!token) {
            throw new Error("No token received from chrome.identity")
          }

          // 8. Store token for future use
          await storeOAuthToken(token)

          // 9. Verify Firebase auth still available
          if (!auth) {
            throw new Error("Firebase auth not available during sign in")
          }

          // 10. Create Google credential
          const credential = GoogleAuthProvider.credential(null, token)

          // 11. Sign in to Firebase
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
```

**Key Steps:**
1. ✅ Guard against concurrent logins
2. ✅ Verify Firebase initialization
3. ✅ Check existing session (avoid unnecessary OAuth)
4. ✅ Try stored token (silent auth)
5. ✅ Fall back to interactive OAuth
6. ✅ Store token for future use
7. ✅ Authenticate with Firebase
8. ✅ Return success/error status

---

### 2. makeApiCall() - API Request Wrapper

**Location:** `background.ts:51-81`

**Purpose:** Centralized API call handler with authentication

```typescript
const makeApiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  try {
    // 1. Get current Firebase ID token
    const idToken = await getFirebaseIdToken()

    // 2. Verify token exists
    if (!idToken) {
      throw new Error("No valid Firebase ID token available")
    }

    // 3. Make HTTP request with Bearer authentication
    const response = await fetch(`${EXPRESS_SERVER_URL}${endpoint}`, {
      ...options,  // Spread existing options (method, body, etc.)
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,  // Add Firebase token
        ...options.headers  // Allow header overrides
      }
    })

    // 4. Check HTTP status
    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(
        `API call failed: ${response.status} ${response.statusText} - ${errorData}`
      )
    }

    // 5. Parse and return JSON
    return await response.json()
  } catch (error) {
    // 6. Re-throw for caller to handle
    throw error
  }
}
```

**Why this pattern:**
- ✅ **DRY:** Single place for auth logic
- ✅ **Consistent:** All API calls use same pattern
- ✅ **Error handling:** Centralized error formatting
- ✅ **Token management:** Automatic token injection
- ✅ **Flexibility:** Accepts custom headers and options

---

### 3. loadUserSnippets() - Fetch Snippets from Backend

**Location:** `background.ts:248-286`

**Purpose:** Load all user snippets and transform into usable format

```typescript
const loadUserSnippets = async (userId: string) => {
  try {
    // 1. Fetch snippets from Express backend
    const response = await makeApiCall("/api/snippets")

    // 2. Initialize empty structures
    const snippets: Record<string, string> = {}
    const metadata: Record<string, { docId: string; usageCount: number; lastUsed?: Date }> = {}

    // 3. Process response
    if (response.success && response.snippets) {
      response.snippets.forEach((item: any) => {
        // 4. Extract fields (handle different field names)
        const keyword = item.keyword || item.shortcut || item.trigger
        const value = item.value || item.text || item.content
        const usageCount = item.usageCount || 0
        const lastUsed = item.lastUsed ? new Date(item.lastUsed) : undefined

        // 5. Validate required fields
        if (keyword && value) {
          // 6. Ensure keyword starts with "/"
          const formattedKeyword = keyword.startsWith("/")
            ? keyword
            : `/${keyword}`

          // 7. Store in snippets map
          snippets[formattedKeyword] = value

          // 8. Store metadata separately
          metadata[formattedKeyword] = {
            docId: item.id || item._id,
            usageCount,
            lastUsed
          }
        }
      })
    }

    // 9. Update global metadata
    snippetMetadata = metadata

    // 10. Return snippets map
    return snippets
  } catch (error) {
    // 11. Return empty on error
    return {}
  }
}
```

**Data transformation:**
```
Backend format:
{
  snippets: [
    { id: "doc_123", keyword: "email", value: "user@example.com", usageCount: 42 }
  ]
}

↓ Transform ↓

Extension format:
snippets = {
  "/email": "user@example.com"
}

snippetMetadata = {
  "/email": { docId: "doc_123", usageCount: 42, lastUsed: Date(...) }
}
```

---

### 4. incrementUsageCount() - Track Usage

**Location:** `background.ts:289-343`

**Purpose:** Increment usage counter and broadcast update

```typescript
const incrementUsageCount = async (keyword: string) => {
  // 1. Validate prerequisites
  if (!currentUser || !snippetMetadata[keyword]) {
    return
  }

  try {
    // 2. Get document ID for this snippet
    const { docId } = snippetMetadata[keyword]

    // 3. Update in Express server
    const response = await makeApiCall(`/api/snippets/${docId}/usage`, {
      method: "POST"
    })

    if (response.success) {
      // 4. Update local metadata cache
      snippetMetadata[keyword].usageCount += 1
      snippetMetadata[keyword].lastUsed = new Date()

      // 5. Prepare update data
      const usageData = {
        keyword,
        usageCount: snippetMetadata[keyword].usageCount,
        lastUsed: snippetMetadata[keyword].lastUsed
      }

      // 6. Notify popup (if open)
      chrome.runtime.sendMessage({
        type: "USAGE_UPDATED",
        ...usageData
      }).catch(() => {
        // Popup might not be open, ignore errors
      })

      // 7. Notify all content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: "USAGE_UPDATED",
              ...usageData
            }).catch(() => {
              // Tab might not have content script
            })
          }
        })
      })
    }
  } catch (error) {
    log("❌ Error incrementing usage count:", error)
  }
}
```

**Flow:**
```
Content Script uses snippet
    ↓
Sends INCREMENT_USAGE message
    ↓
Background increments in database
    ↓
Background updates local cache
    ↓
Background broadcasts to all tabs
    ↓
Popup + Content Scripts update UI
```

---

## Popup UI Functions

### 1. saveCurrentItem() - Create/Update Snippet

**Location:** `popup.tsx:228-325`

**Purpose:** Validate and save snippet to backend

```typescript
const saveCurrentItem = async () => {
  if (!user) return

  // 1. Trim whitespace
  const trimmedKeyword = keyword.trim()
  const trimmedValue = value.trim()

  // 2. Validate keyword
  if (!trimmedKeyword || trimmedKeyword === "/") {
    alert('Please enter a keyword after the "/"')
    return
  }

  // 3. Validate value
  if (!trimmedValue) {
    alert("Please enter a value")
    return
  }

  // 4. Check for duplicate keyword
  const existingKeywordItem = items.find(
    (item) =>
      item.keyword === trimmedKeyword && item.docId !== selectedItem?.docId
  )
  if (existingKeywordItem) {
    alert(`Keyword "${trimmedKeyword}" already exists. Please use a different keyword.`)
    return
  }

  // 5. Check for duplicate value
  const existingValueItem = items.find(
    (item) =>
      item.value === trimmedValue && item.docId !== selectedItem?.docId
  )
  if (existingValueItem) {
    alert(`This value is already mapped to keyword "${existingValueItem.keyword}".`)
    return
  }

  // 6. Show loading state
  setSaving(true)

  try {
    if (isEditing) {
      // ===== CREATE NEW SNIPPET =====
      // 7a. Send to background
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_SNIPPET",
        keyword: trimmedKeyword,
        value: trimmedValue
      })

      if (response.success) {
        // 8a. Create local item
        const newItem: SnippetWithMetadata = {
          keyword: trimmedKeyword,
          value: trimmedValue,
          usageCount: 0,
          docId: response.docId || `new-${Date.now()}`
        }

        // 9a. Add to items array (prepend)
        setItems((prevItems) => [newItem, ...prevItems])

        // 10a. Update selected item
        setSelectedItem(newItem)

        // 11a. Exit edit mode
        setIsEditing(false)
      } else {
        alert(`Error saving item: ${response.error}`)
      }
    } else {
      // ===== UPDATE EXISTING SNIPPET =====
      // 7b. Send update to background
      const response = await chrome.runtime.sendMessage({
        type: "UPDATE_SNIPPET",
        docId: selectedItem?.docId,
        keyword: trimmedKeyword,
        value: trimmedValue
      })

      if (response.success) {
        // 8b. Create updated item
        const updatedItem: SnippetWithMetadata = {
          ...selectedItem!,
          keyword: trimmedKeyword,
          value: trimmedValue
        }

        // 9b. Update in items array
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.docId === selectedItem?.docId ? updatedItem : item
          )
        )

        // 10b. Update selected item
        setSelectedItem(updatedItem)

        // 11b. Exit edit mode
        setIsEditing(false)
      } else {
        alert(`Error updating item: ${response.error}`)
      }
    }
  } catch (error) {
    console.error("Error saving item:", error)
    alert("Error saving item. Please try again.")
  } finally {
    // 12. Hide loading state
    setSaving(false)
  }
}
```

**Validation checks:**
1. ✅ User logged in
2. ✅ Keyword not empty or just "/"
3. ✅ Value not empty
4. ✅ Keyword not already used
5. ✅ Value not already used (each value must be unique)

---

### 2. getSortedItems() - Sorting Logic

**Location:** `popup.tsx:139-156`

**Purpose:** Sort snippets by recent, usage, or alphabetical

```typescript
const getSortedItems = () => {
  // 1. Create mutable copy
  const sortedItems = [...items]

  // 2. Sort based on selected criteria
  switch (sortBy) {
    case "usage":
      // Sort by usage count (descending)
      return sortedItems.sort((a, b) => b.usageCount - a.usageCount)

    case "alphabetical":
      // Sort by keyword (A-Z)
      return sortedItems.sort((a, b) => a.keyword.localeCompare(b.keyword))

    case "recent":
    default:
      // Sort by last used date (most recent first)
      return sortedItems.sort((a, b) => {
        if (!a.lastUsed && !b.lastUsed) return 0  // Both never used
        if (!a.lastUsed) return 1                 // a never used, push down
        if (!b.lastUsed) return -1                // b never used, push down
        // Compare dates (newest first)
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      })
  }
}
```

**Sorting strategies:**
- **Recent:** Most recently used snippets appear first
- **Usage:** Most frequently used snippets appear first
- **Alphabetical:** Keywords sorted A-Z

---

## Content Script Functions

### 1. processInput() - Text Replacement Engine

**Location:** `content.tsx:507-657`

**Purpose:** Detect keywords and replace with values

```typescript
const processInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
  log("🔍 Processing input", {
    value: target.value,
    type: target.type,
    tagName: target.tagName
  })

  // 1. Skip if empty
  if (!target.value) {
    return
  }

  // 2. Skip password fields
  if (target.type === "password" || target.type === "hidden") {
    return
  }

  // 3. Store original value
  let originalValue = target.value
  let newValue = originalValue
  let hasReplacement = false
  let replacedKeywords: string[] = []

  // 4. Process each snippet
  for (const [keyword, replacement] of Object.entries(snippets)) {
    if (newValue.includes(keyword)) {
      // 5. Replace using regex (global flag for multiple occurrences)
      newValue = newValue.replace(
        new RegExp(escapeRegExp(keyword), "g"),
        replacement
      )
      hasReplacement = true
      replacedKeywords.push(keyword)
    }
  }

  if (hasReplacement) {
    // 6. Store cursor position
    const cursorPosition = target.selectionStart || 0
    const cursorEnd = target.selectionEnd || 0

    // 7. Update field value
    target.value = newValue

    // 8. Calculate new cursor position
    const lengthDiff = newValue.length - originalValue.length
    const newCursorPosition = Math.max(0, cursorPosition + lengthDiff)
    const newCursorEnd = Math.max(0, cursorEnd + lengthDiff)

    // 9. Restore cursor position
    setTimeout(() => {
      try {
        target.setSelectionRange(newCursorPosition, newCursorEnd)
        target.focus()
      } catch (e) {
        log("⚠️ Could not set cursor position:", e)
      }
    }, 0)

    // 10. Trigger events for React/Vue compatibility
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

    // 11. Try React's synthetic event pattern
    try {
      const nativeSetter =
        target instanceof HTMLInputElement
          ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
          : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set

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

    // 12. Show toast notification
    if (replacedKeywords.length > 0) {
      const keyword = replacedKeywords[0]
      const replacement = snippets[keyword]
      const displayText =
        replacement.length > 30
          ? replacement.substring(0, 30) + "..."
          : replacement

      // 13. Optimistic usage count update
      const currentUsage = usageCountsRef.current[keyword] || 0
      const newUsageCount = currentUsage + 1

      // 14. Update both ref and state
      usageCountsRef.current[keyword] = newUsageCount
      setUsageCounts(prev => ({
        ...prev,
        [keyword]: newUsageCount
      }))

      // 15. Show toast
      createToast(`${keyword} → ${displayText}`, newUsageCount)

      // 16. Increment usage in background
      incrementUsageCount(keyword)
    }
  }
}
```

**Key techniques:**
- ✅ **Cursor preservation:** Calculate and restore cursor position
- ✅ **React compatibility:** Trigger synthetic events
- ✅ **Multiple replacements:** Handle multiple keywords in same input
- ✅ **Optimistic updates:** Show new usage count immediately

---

### 2. createToast() - Notification System

**Location:** `content.tsx:317-504`

**Purpose:** Show toast notification with usage count

```typescript
const createToast = (message: string, usageCount?: number) => {
  // 1. Remove existing toast
  const existingToast = document.querySelector(".quicktype-toast-wrapper")
  if (existingToast) {
    existingToast.remove()
  }

  // 2. Play notification sound
  playNotificationSound()

  // 3. Create wrapper element
  const wrapper = document.createElement("div")
  wrapper.className = "quicktype-toast-wrapper"

  // 4. Style wrapper (fixed positioning)
  Object.assign(wrapper.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647",  // Maximum z-index
    pointerEvents: "none"
  })

  // 5. Create toast element
  const toast = document.createElement("div")

  // 6. Style toast (dark theme)
  Object.assign(toast.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    backgroundColor: "#0a0a0f",
    color: "#b6b9be",
    borderRadius: "10px",
    borderTopRightRadius: "0px",
    boxShadow: "0 20px 25px -5px rgba(182, 185, 190, 0.1)",
    border: "1px solid rgba(182, 185, 190, 0.1)",
    backdropFilter: "blur(12px)",
    fontSize: "14px",
    maxWidth: "280px",
    opacity: "0",
    transform: "translateX(100%) scale(0.95)",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
  })

  // 7. Create icon SVG
  const iconSVG = `
    <div style="width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #b6b9be, #9ca3af); display: flex; align-items: center; justify-content: center;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="#0a0a0f" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    </div>
  `

  // 8. Create text element
  const textElement = document.createElement("span")
  textElement.textContent = message
  Object.assign(textElement.style, {
    fontSize: "13px",
    paddingRight: usageCount ? "60px" : "0"
  })

  // 9. Create usage badge (if count provided)
  const usageBadge = document.createElement("div")
  usageBadge.innerHTML = `
    <svg width="8" height="8">...</svg>
    <span>${usageCount || 1}</span>
  `

  // 10. Create progress bar
  const progressBar = document.createElement("div")
  Object.assign(progressBar.style, {
    position: "absolute",
    bottom: "0",
    left: "0",
    height: "2px",
    width: "100%",
    background: "linear-gradient(90deg, #b6b9be, #9ca3af)",
    transformOrigin: "left",
    transform: "scaleX(1)",
    transition: "transform 3200ms linear"
  })

  // 11. Assemble toast
  const contentContainer = document.createElement("div")
  contentContainer.appendChild(textElement)
  if (usageCount) {
    contentContainer.appendChild(usageBadge)
  }

  toast.innerHTML = iconSVG
  toast.appendChild(contentContainer)
  toast.appendChild(progressBar)
  wrapper.appendChild(toast)

  // 12. Add to DOM
  document.body.appendChild(wrapper)

  // 13. Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = "1"
    toast.style.transform = "translateX(0) scale(1)"

    // Start progress bar
    setTimeout(() => {
      progressBar.style.transform = "scaleX(0)"
    }, 150)
  })

  // 14. Animate out and remove (3.2 seconds)
  setTimeout(() => {
    toast.style.opacity = "0"
    toast.style.transform = "translateX(100%) scale(0.95)"

    setTimeout(() => {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper)
      }
    }, 400)
  }, 3200)
}
```

**Features:**
- ✅ Dark UI theme matching popup
- ✅ Usage count badge
- ✅ Animated progress bar
- ✅ Slide-in/slide-out animations
- ✅ Auto-dismiss after 3.2 seconds
- ✅ Maximum z-index (always on top)

---

### 3. playNotificationSound() - Web Audio API

**Location:** `content.tsx:262-314`

**Purpose:** Generate notification sound using Web Audio API

```typescript
const playNotificationSound = async () => {
  try {
    // 1. Initialize audio context
    initializeAudioContext()

    if (!audioContextRef.current) {
      return
    }

    // 2. Resume if suspended
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume()
    }

    const ctx = audioContextRef.current
    const now = ctx.currentTime
    const volume = 0.35

    // 3. Create main oscillator (triangle wave at 650Hz)
    const mainOscillator = ctx.createOscillator()
    mainOscillator.type = "triangle"
    mainOscillator.frequency.setValueAtTime(650, now)

    // 4. Create bass layer (sine wave at 120Hz)
    const bassOscillator = ctx.createOscillator()
    bassOscillator.type = "sine"
    bassOscillator.frequency.setValueAtTime(120, now)

    // 5. Create volume envelope (GainNode)
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0, now)                           // Start at 0
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01)      // Attack (10ms)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1)   // Decay (90ms)

    // 6. Connect everything
    mainOscillator.connect(gainNode)
    bassOscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // 7. Play sound
    mainOscillator.start(now)
    bassOscillator.start(now)

    // 8. Stop after 100ms
    mainOscillator.stop(now + 0.1)
    bassOscillator.stop(now + 0.1)

  } catch (error) {
    log("🔇 Audio playback failed:", error)
  }
}
```

**Sound design:**
- **Main tone:** 650Hz triangle wave (clear, pleasant)
- **Bass layer:** 120Hz sine wave (adds depth)
- **Envelope:** Fast attack (10ms) + exponential decay (90ms)
- **Volume:** 35% (not too loud)
- **Duration:** 100ms total

---

## Common Patterns

### 1. Async/Await with Error Handling

```typescript
// Standard pattern throughout codebase
const someFunction = async () => {
  try {
    const result = await asyncOperation()
    // Success handling
  } catch (error) {
    console.error("Error:", error)
    // Error handling
  } finally {
    // Cleanup (if needed)
  }
}
```

---

### 2. Message Passing with Return Value

```typescript
// Sender
const response = await chrome.runtime.sendMessage({
  type: "SOME_ACTION",
  data: someData
})

// Receiver
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SOME_ACTION") {
    asyncOperation().then(sendResponse)
    return true  // Keep channel open for async response
  }
})
```

---

### 3. React State Updates with Callbacks

```typescript
// Functional update pattern (uses previous state)
setItems(prevItems => [newItem, ...prevItems])

setUsageCounts(prev => ({
  ...prev,
  [keyword]: newCount
}))
```

---

## Interview Q&A

### Q1: Why use escapeRegExp() in text replacement?
**A:**
```typescript
// Without escaping
"/email".replace(new RegExp("/email", "g"), "user@example.com")
// Error: Invalid regex (/ is special character)

// With escaping
"/email".replace(new RegExp(escapeRegExp("/email"), "g"), "user@example.com")
// Works: Treats / as literal character
```

**Code:** `content.tsx:534`, `content.tsx:943-945`

---

### Q2: Why dispatch multiple event types after text replacement?
**A:**
- **input:** Standard DOM event
- **change:** Form validation triggers
- **keyup:** Some frameworks listen to keyup
- **InputEvent:** React's synthetic event system

**Different frameworks listen to different events, so we trigger all to ensure compatibility.**

**Code:** `content.tsx:566-584`

---

### Q3: Why use setTimeout(0) for cursor positioning?
**A:**
```typescript
setTimeout(() => {
  target.setSelectionRange(newCursorPosition, newCursorEnd)
}, 0)
```

**Reasons:**
- **Event loop:** Ensures value update completes first
- **Browser rendering:** Allows DOM to update
- **Race conditions:** Prevents cursor being overwritten
- **Compatibility:** Works across all browsers

**Code:** `content.tsx:556-563`

---

### Q4: Why check chrome.runtime.lastError?
**A:**
```typescript
chrome.identity.getAuthToken({ interactive: true }, (token) => {
  if (chrome.runtime.lastError) {
    // Handle error
  }
})
```

**Chrome's callback-based APIs set `chrome.runtime.lastError` instead of throwing. Must check this property to detect errors.**

**Code:** `background.ts:503`, `background.ts:151`

---

### Q5: Why use Object.assign() for inline styles?
**A:**
```typescript
Object.assign(toast.style, {
  position: "fixed",
  top: "20px",
  color: "#b6b9be"
})
```

**Alternative:**
```typescript
toast.style.position = "fixed"
toast.style.top = "20px"
toast.style.color = "#b6b9be"
```

**Benefits:**
- ✅ More concise
- ✅ Better for TypeScript
- ✅ Easier to maintain
- ✅ All styles in one object

**Code:** `content.tsx:331-339`, `content.tsx:344-366`

---

**Next:** See [USER_WORKFLOWS.md](./USER_WORKFLOWS.md) for complete user journey flows.
