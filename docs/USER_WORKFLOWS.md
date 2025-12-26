# User Workflows & Journeys

> Step-by-step user interactions from installation to daily usage

---

## Table of Contents

1. [Workflow 1: Installation & First Login using Google](#workflow-1-installation--first-login)
2. [Workflow 2: Creating First Snippet](#workflow-2-creating-first-snippet)
3. [Workflow 3: Using a Snippet](#workflow-3-using-a-snippet)
4. [Workflow 4: Editing a Snippet](#workflow-4-editing-a-snippet)
5. [Workflow 5: Deleting a Snippet](#workflow-5-deleting-a-snippet)
6. [Workflow 6: Sorting & Viewing Statistics](#workflow-6-sorting--viewing-statistics)
7. [Workflow 7: Multi-Tab Usage](#workflow-7-multi-tab-usage)
8. [Workflow 8: Logout & Re-login](#workflow-8-logout--re-login)

---

## Workflow 1: Installation & First Login

### User Actions → System Response

#### Step 1: Install Extension
**User:** Loads unpacked extension from `build/chrome-mv3-dev` in Chrome

**System:**
```
1. Chrome loads manifest.json
2. Registers background service worker (background.ts)
3. Injects content scripts into all open HTTPS tabs (content.tsx)
4. Shows extension icon in toolbar
```

**Code:** Plasmo auto-generates manifest from `package.json:33-49`

---

#### Step 2: First Click on Extension Icon
**User:** Clicks Quick Type extension icon in toolbar

**System:**
```
1. Chrome opens popup (popup.tsx)
2. Popup checks user state:
   chrome.runtime.sendMessage({ type: "GET_USER" })
3. Background responds: { user: null, isLoading: false }
4. Popup shows login screen with:
   - Animated WebGL light rays (LightRays component)
   - Google sign-in button
   - "End-to-end encrypted" messaging
```

**UI State:**
- Dimensions: 550px × 750px
- Background: Dark theme (#0a0a0f)
- Animation: Pulsating light rays

**Code References:**
- Popup mount: `popup.tsx:63-117`
- Login UI: `popup.tsx:412-494`

---

#### Step 3: Click "Sign in with Google"
**User:** Clicks the Google OAuth button

**Popup:**
```typescript
// popup.tsx:370-392
const onLogin = async () => {
  setIsLoading(true)  // Show loading spinner

  const response = await chrome.runtime.sendMessage({ type: "LOGIN" })

  if (response.success) {
    // Get updated user state
    const userResponse = await chrome.runtime.sendMessage({ type: "GET_USER" })
    setUser(userResponse.user)
    setItems(userResponse.snippetsWithMetadata)
  }
}
```

**Background:**
```typescript
// background.ts:469-533
const handleLogin = async () => {
  // 1. Check existing auth
  const hasExistingAuth = await checkExistingAuth()
  if (hasExistingAuth) return { success: true }

  // 2. Try stored token
  const storedAuthSuccess = await tryAuthWithStoredToken()
  if (storedAuthSuccess) return { success: true }

  // 3. Interactive OAuth flow
  chrome.identity.getAuthToken({ interactive: true }, async (token) => {
    // 4. Store token
    await storeOAuthToken(token)

    // 5. Firebase authentication
    const credential = GoogleAuthProvider.credential(null, token)
    await signInWithCredential(auth, credential)
  })
}
```

**Visual Flow:**
```
User Clicks Button
      ↓
Loading Spinner Appears
      ↓
Google OAuth Consent Screen Opens
      ↓
User Selects Google Account
      ↓
Grants Email & Profile Permissions
      ↓
OAuth Token Received
      ↓
Token Stored in Chrome Storage
      ↓
Firebase Authentication
      ↓
Backend User Sync
      ↓
Load User Snippets
      ↓
Popup Shows Authenticated View
```

---

#### Step 4: Authenticated View Appears
**User:** Sees authenticated interface

**UI Changes:**
```
┌────────────────────────────────────────────────────────┐
│  [Avatar] John Doe                      [Stats] [Logout]│
├────────────────────────────────────────────────────────┤
│           Quick Items        [+ Add New]               │
│  ┌──────────────────────┐                              │
│  │ [Recent] Usage  A-Z  │  (Sort tabs)                 │
│  ├──────────────────────┤                              │
│  │                      │                              │
│  │  (No items yet)      │                              │
│  │                      │                              │
│  │  Click "Add New" to  │                              │
│  │  create first shortcut│                             │
│  │                      │                              │
│  └──────────────────────┘                              │
└────────────────────────────────────────────────────────┘
```

**Dimensions:** 320px width (sidebar only)

**Code:** `popup.tsx:497-843`

---

## Workflow 2: Creating First Snippet

### Step-by-Step with Code References

#### Step 1: Click "Add New" Button
**User:** Clicks "+ Add New" button

**System:**
```typescript
// popup.tsx:199-211
const addNewItem = () => {
  const newItem = {
    keyword: "/",
    value: "",
    usageCount: 0,
    docId: undefined
  }

  setSelectedItem(newItem)
  setKeyword("/")
  setValue("")
  setIsEditing(true)
  setShowRightPanel(true)  // Expands popup width to 750px
}
```

**UI Animation:**
- Popup width animates: 320px → 750px (430ms transition)
- Right panel slides in from right
- Edit form appears

---

#### Step 2: Enter Keyword
**User:** Types "/email" in keyword field

**System:**
```typescript
// popup.tsx:213-218
const handleKeywordChange = (e) => {
  const value = e.target.value

  // Ensure keyword starts with "/"
  if (value.startsWith("/")) {
    setKeyword(value)
  }
}
```

**Validation:**
- ✅ Keyword must start with "/"
- ✅ Cannot type without leading slash

**Code:** `popup.tsx:770-777`

---

#### Step 3: Enter Value
**User:** Types "john.doe@example.com" in value textarea

**System:**
```typescript
// popup.tsx:795
onChange={(e) => setValue(e.target.value)}
```

**UI State:**
- Keyword: "/email"
- Value: "john.doe@example.com"
- "Save Changes" button becomes active

---

#### Step 4: Click "Save Changes"
**User:** Clicks save button

**System:**
```typescript
// popup.tsx:228-325
const saveCurrentItem = async () => {
  // 1. Trim whitespace
  const trimmedKeyword = keyword.trim()  // "/email"
  const trimmedValue = value.trim()      // "john.doe@example.com"

  // 2. Validate
  if (!trimmedKeyword || trimmedKeyword === "/") {
    alert('Please enter a keyword after the "/"')
    return
  }

  if (!trimmedValue) {
    alert("Please enter a value")
    return
  }

  // 3. Check duplicates
  const existingKeywordItem = items.find(
    item => item.keyword === trimmedKeyword
  )
  if (existingKeywordItem) {
    alert(`Keyword "${trimmedKeyword}" already exists`)
    return
  }

  // 4. Show saving state
  setSaving(true)

  // 5. Send to background
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_SNIPPET",
    keyword: trimmedKeyword,
    value: trimmedValue
  })

  if (response.success) {
    // 6. Create local item
    const newItem = {
      keyword: trimmedKeyword,
      value: trimmedValue,
      usageCount: 0,
      docId: response.docId
    }

    // 7. Add to items array (at beginning)
    setItems(prevItems => [newItem, ...prevItems])

    // 8. Exit edit mode
    setIsEditing(false)
  }

  setSaving(false)
}
```

**Background Processing:**
```typescript
// background.ts:814-818
case "SAVE_SNIPPET":
  saveSnippetToExpressServer(message.keyword, message.value)
    .then(sendResponse)
  return true

// background.ts:601-656
const saveSnippetToExpressServer = async (keyword, value) => {
  // 1. API call
  const response = await makeApiCall("/api/snippets", {
    method: "POST",
    body: JSON.stringify({
      keyword,
      value,
      usageCount: 0,
      lastUsed: null
    })
  })

  // 2. Refresh cache
  const refreshedSnippets = await loadUserSnippets(currentUser.uid)
  userSnippets = refreshedSnippets

  // 3. Broadcast to all tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: "SNIPPETS_UPDATED",
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
    })
  })

  return { success: true, docId: response.snippet.id }
}
```

**Complete Flow:**
```
User Clicks "Save"
      ↓
Popup validates input
      ↓
Shows "Saving..." state
      ↓
Sends SAVE_SNIPPET message to background
      ↓
Background makes POST /api/snippets
      ↓
Express server creates in database
      ↓
Background refreshes cache
      ↓
Background broadcasts to all tabs
      ↓
Popup adds to items array
      ↓
Right panel exits edit mode
      ↓
Snippet appears in left sidebar
```

**Result:**
- New snippet visible in sidebar
- usageCount: 0
- lastUsed: "Never used"

---

## Workflow 3: Using a Snippet

### Complete Usage Flow

#### Step 1: User Opens Gmail
**User:** Navigates to gmail.com

**System:**
```
1. Content script initializes on page load
2. Checks user authentication state:
   getUserState() with retry mechanism (3 attempts)
3. Receives snippets from background
4. Sets up 5-layer input detection system
```

**Code:** `content.tsx:73-124`

---

#### Step 2: Click Email Compose
**User:** Clicks "Compose" button in Gmail

**System:**
```
1. Mutation Observer detects new textarea added to DOM
2. Focus listener detects textarea focus
3. Event listeners attached (input, keyup, paste, blur, change)
```

**Detection Layers:**
```
Layer 1: Event listeners on document ✅
Layer 2: Focus tracking ✅
Layer 3: Mutation Observer ✅
Layer 4: Active element polling (1s) ✅
Layer 5: Periodic scanning (10s) ✅
```

**Code:** `content.tsx:786-940`

---

#### Step 3: Type "/email" in Email Body
**User:** Types "/email" in compose textarea

**System:**
```
1. Input event fired
2. processInput() called with 150ms debounce
3. Check if value includes any snippet keywords
```

**Code:**
```typescript
// content.tsx:507-657
const processInput = (target) => {
  let originalValue = target.value  // "My email is /email"
  let newValue = originalValue
  let replacedKeywords = []

  // Check each snippet
  for (const [keyword, replacement] of Object.entries(snippets)) {
    if (newValue.includes(keyword)) {  // "/email" found!
      newValue = newValue.replace(
        new RegExp(escapeRegExp(keyword), "g"),
        replacement
      )
      // Result: "My email is john.doe@example.com"
      replacedKeywords.push(keyword)
    }
  }

  if (replacedKeywords.length > 0) {
    // Store cursor position
    const cursorPosition = target.selectionStart

    // Update field
    target.value = newValue

    // Calculate new cursor position
    const lengthDiff = newValue.length - originalValue.length
    const newCursorPosition = cursorPosition + lengthDiff

    // Restore cursor
    setTimeout(() => {
      target.setSelectionRange(newCursorPosition, newCursorPosition)
    }, 0)

    // Trigger events for React/Vue
    target.dispatchEvent(new Event("input", { bubbles: true }))
    target.dispatchEvent(new Event("change", { bubbles: true }))

    // Show toast
    const currentUsage = usageCountsRef.current[keyword] || 0
    const newUsageCount = currentUsage + 1

    createToast(`/email → john.doe@example.com`, newUsageCount)

    // Increment usage
    incrementUsageCount(keyword)
  }
}
```

---

#### Step 4: Text Replacement Occurs
**User:** Sees text instantly change

**Before:** `My email is /email`
**After:** `My email is john.doe@example.com`

**Cursor Position:**
- Before: After "l" in "/email"
- After: At end of "john.doe@example.com"
- Adjustment: Calculated based on length difference

---

#### Step 5: Toast Notification Appears
**User:** Sees notification in top-right corner

**Toast Content:**
```
┌─────────────────────────────────────┐
│ ✓ /email → john.doe@example.com  1 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━ (3.2s)  │
└─────────────────────────────────────┘
```

**Features:**
- ✅ Success checkmark icon
- ✅ Keyword → Value preview
- ✅ Usage count badge (shows "1" for first use)
- ✅ Animated progress bar
- ✅ Notification sound (650Hz + 120Hz, 100ms)
- ✅ Auto-dismiss after 3.2 seconds

**Code:** `content.tsx:317-504`

---

#### Step 6: Usage Count Incremented
**System:**

**Content Script:**
```typescript
// content.tsx:61-71
await chrome.runtime.sendMessage({
  type: "INCREMENT_USAGE",
  keyword: "/email"
})
```

**Background Script:**
```typescript
// background.ts:832-835
case "INCREMENT_USAGE":
  incrementUsageCount(message.keyword)
  sendResponse({ success: true })
  break

// background.ts:289-343
const incrementUsageCount = async (keyword) => {
  const { docId } = snippetMetadata[keyword]

  // API call
  const response = await makeApiCall(`/api/snippets/${docId}/usage`, {
    method: "POST"
  })

  // Update local metadata
  snippetMetadata[keyword].usageCount += 1
  snippetMetadata[keyword].lastUsed = new Date()

  // Broadcast to popup
  chrome.runtime.sendMessage({
    type: "USAGE_UPDATED",
    keyword,
    usageCount: snippetMetadata[keyword].usageCount,
    lastUsed: snippetMetadata[keyword].lastUsed
  })

  // Broadcast to all content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: "USAGE_UPDATED",
        keyword,
        usageCount: snippetMetadata[keyword].usageCount
      })
    })
  })
}
```

**Result:**
- Database: usageCount = 1, lastUsed = "2025-12-26T10:45:00Z"
- Popup (if open): Shows "1" next to "/email"
- Content scripts: Update local usage counts

---

## Workflow 4: Editing a Snippet

#### Step 1: Select Snippet in Popup
**User:** Clicks "/email" item in left sidebar

**System:**
```typescript
// popup.tsx:220-226
const selectItem = (item) => {
  setSelectedItem(item)
  setKeyword(item.keyword)      // "/email"
  setValue(item.value)           // "john.doe@example.com"
  setIsEditing(false)            // View mode (not edit mode)
  setShowRightPanel(true)        // Show right panel
}
```

**UI Change:**
- Popup expands to 750px
- Right panel shows snippet details
- "Edit Item" header (not "Create New Item")
- Usage stats displayed: "Used 42 times • 2h ago"

---

#### Step 2: Modify Value
**User:** Changes value to "john.doe@company.com"

**System:**
```typescript
setValue("john.doe@company.com")  // Update React state
```

**UI State:**
- Keyword: "/email" (unchanged)
- Value: "john.doe@company.com" (modified)
- "Save Changes" button active

---

#### Step 3: Save Changes
**User:** Clicks "Save Changes"

**System:**
```typescript
// popup.tsx:294-318
const response = await chrome.runtime.sendMessage({
  type: "UPDATE_SNIPPET",
  docId: selectedItem.docId,  // "doc_123"
  keyword: "/email",
  value: "john.doe@company.com"
})

if (response.success) {
  const updatedItem = {
    ...selectedItem,
    keyword: "/email",
    value: "john.doe@company.com"
  }

  // Update in items array
  setItems(prevItems =>
    prevItems.map(item =>
      item.docId === selectedItem.docId ? updatedItem : item
    )
  )

  setSelectedItem(updatedItem)
}
```

**Background:**
```typescript
// background.ts:673-679
const response = await makeApiCall(`/api/snippets/${docId}`, {
  method: "PUT",
  body: JSON.stringify({
    keyword: "/email",
    value: "john.doe@company.com"
  })
})

// Refresh and broadcast
const refreshedSnippets = await loadUserSnippets(currentUser.uid)
userSnippets = refreshedSnippets

chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      type: "SNIPPETS_UPDATED",
      snippets: userSnippets
    })
  })
})
```

**Result:**
- Database updated
- All tabs receive new value
- Next "/email" usage shows "john.doe@company.com"

---

## Workflow 5: Deleting a Snippet

#### Step 1: Hover Over Snippet
**User:** Hovers mouse over "/email" in sidebar

**System:**
```css
/* Trash button appears with opacity animation */
.group-hover:opacity-100
```

**UI:** Trash icon (🗑️) becomes visible

---

#### Step 2: Click Delete Button
**User:** Clicks trash icon

**System:**
```typescript
// popup.tsx:327-368
const deleteItem = async (itemToDelete) => {
  // 1. Add to deleting set (for animation)
  setDeletingItems(prev => new Set(prev).add(itemToDelete.docId))

  // 2. Wait for animation (300ms)
  setTimeout(async () => {
    // 3. Send delete request
    const response = await chrome.runtime.sendMessage({
      type: "DELETE_SNIPPET",
      keyword: itemToDelete.keyword
    })

    if (response.success) {
      // 4. Remove from local state
      setItems(prevItems =>
        prevItems.filter(item => item.docId !== itemToDelete.docId)
      )

      // 5. Clear selection if deleted item was selected
      if (selectedItem && selectedItem.docId === itemToDelete.docId) {
        setSelectedItem(null)
        setKeyword("/")
        setValue("")
      }
    }

    // 6. Remove from deleting set
    setDeletingItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(itemToDelete.docId)
      return newSet
    })
  }, 300)
}
```

**Animation:**
```css
/* Item slides out to left and fades */
.animate-slide-out-left {
  animation: slideOutLeft 300ms ease-out forwards;
  opacity: 0;
  transform: translateX(-100%);
}
```

**Background:**
```typescript
// background.ts:735
const response = await makeApiCall(`/api/snippets/${docId}`, {
  method: "DELETE"
})

// Refresh and broadcast
const refreshedSnippets = await loadUserSnippets(currentUser.uid)
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      type: "SNIPPETS_UPDATED",
      snippets: refreshedSnippets
    })
  })
})
```

**Result:**
- Item slides out and disappears
- Database record deleted
- All tabs notified (snippet no longer available)

---

## Workflow 6: Sorting & Viewing Statistics

#### Step 1: Click Statistics Button
**User:** Clicks bar chart icon in header

**System:**
```typescript
// popup.tsx:534
onClick={() => setShowStats(!showStats)}
```

**UI Change:**
```
┌────────────────────────────────────┐
│  [Avatar] John Doe  [📊] [Logout]  │
├────────────────────────────────────┤
│         Usage Statistics           │
│  ┌────────┐  ┌────────┐           │
│  │   142  │  │   12   │           │
│  │ Total  │  │ Total  │           │
│  │  Uses  │  │Shortcuts│          │
│  └────────┘  └────────┘           │
│                                    │
│  Most Used Shortcut:               │
│  /email                            │
│  Used 42 times                     │
└────────────────────────────────────┘
```

**Calculations:**
```typescript
// popup.tsx:175-177
const getTotalUsage = () => {
  return items.reduce((sum, item) => sum + item.usageCount, 0)
}

// popup.tsx:179-189
const getMostUsedItem = () => {
  return items.reduce((max, item) =>
    item.usageCount > max.usageCount ? item : max,
    { keyword: "", usageCount: 0 }
  )
}
```

---

#### Step 2: Change Sort Order
**User:** Clicks "Usage" tab

**System:**
```typescript
// popup.tsx:620
onClick={() => setSortBy("usage")}

// popup.tsx:139-156
const getSortedItems = () => {
  const sortedItems = [...items]

  switch (sortBy) {
    case "usage":
      return sortedItems.sort((a, b) => b.usageCount - a.usageCount)

    case "alphabetical":
      return sortedItems.sort((a, b) => a.keyword.localeCompare(b.keyword))

    case "recent":
    default:
      return sortedItems.sort((a, b) => {
        if (!a.lastUsed && !b.lastUsed) return 0
        if (!a.lastUsed) return 1
        if (!b.lastUsed) return -1
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      })
  }
}
```

**Result:**
- Snippets re-ordered by usage count (descending)
- Most used snippets appear at top

---

## Workflow 7: Multi-Tab Usage

#### Scenario: User has 3 tabs open

**Tab 1:** gmail.com
**Tab 2:** linkedin.com
**Tab 3:** twitter.com

---

#### Step 1: User Opens Popup and Creates "/company" Snippet
**Location:** Popup (not tied to specific tab)

**System:**
```
1. Popup sends SAVE_SNIPPET to background
2. Background creates in database
3. Background broadcasts SNIPPETS_UPDATED to all tabs:

   chrome.tabs.query({}, (tabs) => {
     // Sends to Tab 1, Tab 2, Tab 3
   })
```

---

#### Step 2: Content Scripts Receive Update
**All Tabs:**
```typescript
// Tab 1, 2, 3 content scripts all receive:
case "SNIPPETS_UPDATED":
  globalSnippets = message.snippets  // Now includes "/company"
  setSnippets(message.snippets)
```

---

#### Step 3: User Switches to Tab 2 (LinkedIn)
**User:** Clicks on LinkedIn tab

**System:**
- Content script already has updated snippets
- "/company" immediately available for use
- No need to reload or sync

---

#### Step 4: User Types "/company" in LinkedIn
**System:**
- Replacement works immediately
- Toast notification shows
- Usage count incremented
- All other tabs (1, 3) receive USAGE_UPDATED message

**Synchronization:**
```
Tab 2 (active)
  ↓ INCREMENT_USAGE
Background
  ↓ POST /api/snippets/:id/usage
Express Backend
  ↓ usageCount++
Background
  ↓ USAGE_UPDATED broadcast
Tab 1, Tab 3 (background)
  ↓ Update local usage counts
```

---

## Workflow 8: Logout & Re-login

#### Step 1: Click Logout
**User:** Clicks logout button in popup header

**System:**
```typescript
// popup.tsx:395-409
const onLogout = async () => {
  const response = await chrome.runtime.sendMessage({ type: "LOGOUT" })

  if (response.success) {
    setUser(null)
    setItems([])
    setSelectedItem(null)
    setKeyword("/")
    setValue("")
  }
}
```

**Background:**
```typescript
// background.ts:536-562
const handleLogout = async () => {
  // 1. Clear stored OAuth token
  await clearStoredOAuthToken()

  // 2. Remove cached token from Chrome Identity
  const token = await getStoredOAuthToken()
  if (token) {
    chrome.identity.removeCachedAuthToken({ token }, () => {})
  }

  // 3. Sign out from Firebase
  await signOut(auth)

  return { success: true }
}
```

**Firebase onAuthStateChanged triggered:**
```typescript
// background.ts:432-463
currentUser = null
userSnippets = {}
snippetMetadata = {}

// Notify popup
chrome.runtime.sendMessage({
  type: "USER_STATE_CHANGED",
  user: null,
  snippets: {}
})

// Notify all content scripts
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      type: "USER_LOGOUT"
    })
  })
})
```

**Result:**
- Popup shows login screen
- All content scripts reset to default state
- OAuth token cleared
- Firebase logged out

---

#### Step 2: Re-login
**User:** Clicks "Sign in with Google" again

**System:**
```
1. Checks for stored token (cleared, so skip)
2. Opens OAuth consent screen
3. User already granted permissions → instant approval
4. New token retrieved
5. Firebase re-authentication
6. Snippets reloaded from database
7. Popup shows authenticated view
8. Content scripts receive snippets
```

**Silent re-authentication possible because:**
- Google remembers permission grant
- Chrome caches OAuth credentials
- Firebase session can be restored

---

**Next:** See [TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md) for advanced implementation topics.
