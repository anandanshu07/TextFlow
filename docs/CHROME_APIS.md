# Chrome Extension APIs Usage

> Complete reference for all Chrome APIs used in Quick Type extension

---

## Table of Contents

1. [chrome.runtime API](#chromeruntime-api)
2. [chrome.storage.local API](#chromestoragelocal-api)
3. [chrome.identity API](#chromeidentity-api)
4. [chrome.tabs API](#chrometabs-api)
5. [Manifest V3 Configuration](#manifest-v3-configuration)
6. [Interview Q&A](#interview-qa)

---

## chrome.runtime API

### Purpose
Inter-component communication between popup, background, and content scripts

### Methods Used

#### 1. chrome.runtime.sendMessage()

**Send message to background script:**
```typescript
// From popup.tsx
const response = await chrome.runtime.sendMessage({
  type: "LOGIN"
})

const response = await chrome.runtime.sendMessage({
  type: "SAVE_SNIPPET",
  keyword: "/email",
  value: "user@example.com"
})

// From content.tsx
await chrome.runtime.sendMessage({
  type: "INCREMENT_USAGE",
  keyword: "/email"
})
```

**Code References:**
- Popup: `popup.tsx:67-70`, `popup.tsx:124-126`, `popup.tsx:272-276`
- Content: `content.tsx:36-38`, `content.tsx:63-66`

**Return Value:** Promise that resolves with response from message handler

---

#### 2. chrome.runtime.onMessage.addListener()

**Listen for messages (Background Script):**
```typescript
// background.ts:774-903
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "LOGIN":
      handleLogin().then(sendResponse)
      return true // Keep message channel open for async response

    case "GET_USER":
      sendResponse({
        user: currentUser,
        isLoading,
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
      break

    case "SAVE_SNIPPET":
      saveSnippetToExpressServer(message.keyword, message.value)
        .then(sendResponse)
      return true

    // ... more cases
  }
})
```

**Listen for messages (Popup):**
```typescript
// popup.tsx:86-116
const handleUserStateChange = (message) => {
  if (message.type === "USER_STATE_CHANGED") {
    setUser(message.user)
    setItems(message.snippetsWithMetadata)
  }
  else if (message.type === "USAGE_UPDATED") {
    setItems(prevItems =>
      prevItems.map(item =>
        item.keyword === message.keyword
          ? { ...item, usageCount: message.usageCount }
          : item
      )
    )
  }
}

chrome.runtime.onMessage.addListener(handleUserStateChange)
```

**Listen for messages (Content Script):**
```typescript
// content.tsx:132-230
const handleMessage = (message: any) => {
  switch (message.type) {
    case "USER_LOGIN":
      setUser(message.user)
      setSnippets(message.snippets)
      break

    case "USER_LOGOUT":
      setUser(null)
      setSnippets({"/email": "Please Login"})
      break

    case "SNIPPETS_UPDATED":
      setSnippets(message.snippets)
      break

    case "USAGE_UPDATED":
      setUsageCounts(prev => ({
        ...prev,
        [message.keyword]: message.usageCount
      }))
      break
  }
}

chrome.runtime.onMessage.addListener(handleMessage)
```

**Important:**
- Return `true` to keep message channel open for async responses
- Use `sendResponse()` callback for async operations
- Cleanup listeners on unmount

---

## chrome.storage.local API

### Purpose
Persist OAuth tokens and expiry timestamps across browser sessions

### Methods Used

#### 1. chrome.storage.local.set()

**Store OAuth token:**
```typescript
// background.ts:101-104
await chrome.storage.local.set({
  [OAUTH_TOKEN_KEY]: token,              // "quicktype_oauth_token"
  [TOKEN_EXPIRY_KEY]: expiryTime         // "quicktype_token_expiry"
})
```

**Code Reference:** `background.ts:96-106`

---

#### 2. chrome.storage.local.get()

**Retrieve stored token:**
```typescript
// background.ts:111-114
const result = await chrome.storage.local.get([
  OAUTH_TOKEN_KEY,
  TOKEN_EXPIRY_KEY
])

const token = result[OAUTH_TOKEN_KEY]
const expiry = result[TOKEN_EXPIRY_KEY]
```

**Code Reference:** `background.ts:109-139`

---

#### 3. chrome.storage.local.remove()

**Clear stored tokens:**
```typescript
// background.ts:173-177
await chrome.storage.local.remove([
  OAUTH_TOKEN_KEY,
  TOKEN_EXPIRY_KEY,
  REFRESH_TOKEN_KEY
])
```

**Code Reference:** `background.ts:171-179`

---

### Storage Keys

```typescript
// background.ts:91-93
const OAUTH_TOKEN_KEY = "quicktype_oauth_token"
const TOKEN_EXPIRY_KEY = "quicktype_token_expiry"
const REFRESH_TOKEN_KEY = "quicktype_refresh_token"
```

### Storage Data Structure

```javascript
{
  "quicktype_oauth_token": "ya29.a0AfH6SMB...",
  "quicktype_token_expiry": 1703606400000,  // Unix timestamp
  "quicktype_refresh_token": null           // Not currently used
}
```

---

## chrome.identity API

### Purpose
Google OAuth authentication without requiring user to enter credentials

### Methods Used

#### 1. chrome.identity.getAuthToken()

**Interactive login (opens OAuth consent):**
```typescript
// background.ts:501
chrome.identity.getAuthToken({ interactive: true }, async (token) => {
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message)
  }

  if (!token) {
    throw new Error("No token received")
  }

  // Store token
  await storeOAuthToken(token)

  // Authenticate with Firebase
  const credential = GoogleAuthProvider.credential(null, token)
  await signInWithCredential(auth, credential)
})
```

**Code Reference:** `background.ts:501-528`

**Silent token refresh (no UI):**
```typescript
// background.ts:150
chrome.identity.getAuthToken({ interactive: false }, async (token) => {
  if (chrome.runtime.lastError || !token) {
    resolve(null)
    return
  }

  await storeOAuthToken(token)
  resolve(token)
})
```

**Code Reference:** `background.ts:142-168`

---

#### 2. chrome.identity.removeCachedAuthToken()

**Clear cached token on logout:**
```typescript
// background.ts:546-552
const token = await getStoredOAuthToken()
if (token) {
  chrome.identity.removeCachedAuthToken({ token }, () => {
    // Token removed from Chrome's cache
  })
}
```

**Code Reference:** `background.ts:546-552`

---

### OAuth Configuration

**Manifest (package.json):**
```json
{
  "oauth2": {
    "client_id": "$PLASMO_PUBLIC_FIREBASE_CLIENT_ID",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

**Client ID:** `257353424964-q2s2pja7mn9gktpacgloc0rfmn93g226.apps.googleusercontent.com`

---

## chrome.tabs API

### Purpose
Send messages to content scripts in specific tabs and listen for tab events

### Methods Used

#### 1. chrome.tabs.query()

**Get all open tabs:**
```typescript
// background.ts:325-338
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "USAGE_UPDATED",
        keyword: keyword,
        usageCount: usageCount,
        lastUsed: lastUsed
      }).catch(() => {
        // Tab might not have content script, ignore errors
      })
    }
  })
})
```

**Code References:**
- Broadcast snippets: `background.ts:412-431`
- Broadcast usage: `background.ts:325-338`
- Broadcast updates: `background.ts:574-588`

---

#### 2. chrome.tabs.sendMessage()

**Send message to specific tab:**
```typescript
// background.ts:328-335
chrome.tabs.sendMessage(tab.id, {
  type: "USAGE_UPDATED",
  keyword: keyword,
  usageCount: usageCount,
  lastUsed: lastUsed
}).catch(() => {
  // Error handling: Tab might not have content script
})
```

**Why .catch():**
- Not all tabs have content script injected
- HTTPS-only restriction (extension doesn't run on HTTP)
- Chrome system pages (chrome://, chrome-extension://)
- Prevents uncaught promise rejections

---

#### 3. chrome.tabs.onUpdated.addListener()

**Listen for tab loading completion:**
```typescript
// background.ts:906-926
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && currentUser) {
    // Small delay to ensure content script is loaded
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: "USER_LOGIN",
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName
        },
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      }).catch(() => {
        // Tab might not have content script
      })
    }, 1000)
  }
})
```

**Code Reference:** `background.ts:906-926`

**Purpose:**
- Notify newly opened tabs about user state
- Send current snippets to new content scripts
- Ensure all tabs stay synchronized

---

## Manifest V3 Configuration

### Complete Manifest Configuration

**Source:** `package.json:33-49`

```json
{
  "manifest": {
    "key": "$CRX_PUBLIC_KEY",
    "host_permissions": [
      "https://*/*"
    ],
    "permissions": [
      "identity",
      "storage"
    ],
    "oauth2": {
      "client_id": "$PLASMO_PUBLIC_FIREBASE_CLIENT_ID",
      "scopes": [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ]
    }
  }
}
```

### Permissions Breakdown

#### 1. identity
**Purpose:** Access Chrome Identity API for Google OAuth

**Usage:**
- `chrome.identity.getAuthToken()` - Get OAuth tokens
- `chrome.identity.removeCachedAuthToken()` - Clear tokens

**Why needed:**
- Seamless Google sign-in without popup windows
- Leverages Chrome's built-in OAuth flow
- No need to implement custom OAuth flow

---

#### 2. storage
**Purpose:** Store OAuth tokens in Chrome's local storage

**Usage:**
- `chrome.storage.local.set()` - Store tokens
- `chrome.storage.local.get()` - Retrieve tokens
- `chrome.storage.local.remove()` - Clear tokens

**Why needed:**
- Persist authentication across browser restarts
- Faster than IndexedDB or localStorage
- Survives extension updates

---

#### 3. host_permissions: ["https://*/*"]
**Purpose:** Allow content scripts to run on all HTTPS websites

**Why needed:**
- Snippet replacement works on any secure website
- Content script injection on all HTTPS pages
- Does NOT work on HTTP (insecure) sites

**Restriction:**
- Only HTTPS (not HTTP)
- Not on chrome:// pages
- Not on chrome-extension:// pages

---

### Content Scripts Auto-Injection

**Plasmo automatically configures:**
```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

**Generated from:** `content.tsx` React component

---

### Background Service Worker

**Plasmo automatically configures:**
```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

**Generated from:** `background.ts`

---

### Popup Configuration

**Plasmo automatically configures:**
```json
{
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    }
  }
}
```

**Generated from:** `popup.tsx` React component

---

## Interview Q&A

### Q1: What's the difference between chrome.storage.local and localStorage?
**A:**

| Feature | chrome.storage.local | localStorage |
|---------|---------------------|--------------|
| **Scope** | Extension-wide | Per-origin |
| **Service Worker** | ✅ Accessible | ❌ Not accessible |
| **Async** | ✅ Promise-based | ❌ Synchronous |
| **Quota** | ~10MB | ~5-10MB |
| **Survives** | Extension updates | Page reloads only |
| **Sync** | Can sync across devices | Local only |

**Why we use chrome.storage.local:**
- Service workers can't access localStorage
- Better for extension architecture
- Promise-based API (modern)

---

### Q2: Why use { interactive: false } for token refresh?
**A:**
- **Silent operation:** No UI popup
- **Better UX:** User doesn't see OAuth screen repeatedly
- **Background refresh:** Works without user interaction
- **Falls back gracefully:** If fails, next operation prompts login

**Code:** `background.ts:150`

---

### Q3: Why broadcast to all tabs instead of just active tab?
**A:**
- **Consistency:** All content scripts have latest data
- **Multi-tab workflow:** User might switch between tabs
- **Instant sync:** Changes visible immediately everywhere
- **Edge cases:** Handles background tabs, pinned tabs

**Example:**
```
User creates snippet in popup
  → Background updates all 10 open tabs
  → User switches to Tab 5
  → New snippet already available for use
```

---

### Q4: What happens if sendMessage fails?
**A:**
```typescript
chrome.tabs.sendMessage(tabId, message).catch(() => {
  // Ignore error - tab might not have content script
})
```

**Common reasons:**
- Tab is on HTTP page (extension only works on HTTPS)
- Tab is chrome:// system page
- Content script not injected yet
- Tab closed before message sent

**Handling:** Errors silently ignored with `.catch()` to prevent crashes

---

### Q5: How does extension handle chrome:// pages?
**A:**
- **Content scripts:** Don't inject (Chrome restriction)
- **Popup:** Still works (not page-dependent)
- **Background:** Always running
- **User experience:** Snippets only work on HTTPS websites

---

### Q6: Why 1-second delay in onUpdated listener?
**A:**
```typescript
setTimeout(() => {
  chrome.tabs.sendMessage(tabId, ...)
}, 1000)
```

**Reasons:**
- **Content script injection:** Takes time after page load
- **Race condition:** Avoid sending message before script ready
- **Reliability:** Ensures message delivered successfully
- **Trade-off:** 1s delay vs message delivery guarantee

**Code:** `background.ts:909-924`

---

### Q7: Can extension work in incognito mode?
**A:**
- **Yes, if enabled:** User must enable "Allow in incognito" in chrome://extensions
- **Separate storage:** Incognito has separate chrome.storage
- **Authentication:** Requires separate login in incognito
- **Snippets:** Not shared between normal and incognito (by design)

---

**Next:** See [CODE_DEEP_DIVE.md](./CODE_DEEP_DIVE.md) for implementation details and key functions.
