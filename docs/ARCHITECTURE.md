# System Architecture & Data Flow

> Deep dive into Quick Type's component architecture, state management, and communication patterns

---

## Table of Contents

1. [Component Overview](#component-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Responsibilities](#component-responsibilities)
4. [State Management](#state-management)
5. [Data Flow Patterns](#data-flow-patterns)
6. [Message Passing Architecture](#message-passing-architecture)
7. [Authentication Flow](#authentication-flow)
8. [Snippet Lifecycle](#snippet-lifecycle)
9. [Real-time Synchronization](#real-time-synchronization)
10. [Interview Q&A](#interview-qa)

---

## Component Overview

Quick Type is built with a **three-component architecture** following Chrome Extension Manifest V3 standards:

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome Extension                        │
│                                                          │
│  ┌────────────────┐                                     │
│  │  Popup UI      │  User Interface Layer               │
│  │  (popup.tsx)   │  - React 18.2.0                     │
│  │  847 lines     │  - Snippet management               │
│  └────────┬───────┘  - Statistics display               │
│           │                                              │
│           │ chrome.runtime.sendMessage()                │
│           ▼                                              │
│  ┌────────────────┐                                     │
│  │  Background    │  Service Worker Layer               │
│  │  (background.ts)│ - Authentication                   │
│  │  971 lines     │  - API communication                │
│  └────────┬───────┘  - State management                 │
│           │                                              │
│           │ chrome.tabs.sendMessage()                   │
│           ▼                                              │
│  ┌────────────────┐                                     │
│  │ Content Script │  Injection Layer                    │
│  │ (content.tsx)  │  - React component                  │
│  │ 1123 lines     │  - Input detection                  │
│  └────────────────┘  - Text replacement                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

### Complete System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User's Browser (Chrome)                        │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Extension Components                       │   │
│  │                                                               │   │
│  │  ┌──────────────┐         ┌──────────────────┐             │   │
│  │  │   Popup UI   │◄───────►│   Background     │             │   │
│  │  │   (React)    │ Messages│   Service Worker │             │   │
│  │  │              │         │                  │             │   │
│  │  │ - Login UI   │         │ - currentUser    │             │   │
│  │  │ - Snippet    │         │ - userSnippets   │             │   │
│  │  │   Management │         │ - snippetMetadata│             │   │
│  │  │ - Statistics │         │ - Auth state     │             │   │
│  │  └──────────────┘         └────────┬─────────┘             │   │
│  │                                     │                        │   │
│  │                                     │ Broadcasts             │   │
│  │                                     │ to all tabs            │   │
│  │                                     ▼                        │   │
│  │         ┌───────────────────────────────────────┐           │   │
│  │         │     Content Scripts (All Tabs)        │           │   │
│  │         │                                        │           │   │
│  │         │  Tab 1         Tab 2         Tab N    │           │   │
│  │         │ ┌─────────┐  ┌─────────┐  ┌─────────┐│           │   │
│  │         │ │ content │  │ content │  │ content ││           │   │
│  │         │ │ (React) │  │ (React) │  │ (React) ││           │   │
│  │         │ │         │  │         │  │         ││           │   │
│  │         │ │ • Input │  │ • Input │  │ • Input ││           │   │
│  │         │ │   detect│  │   detect│  │   detect││           │   │
│  │         │ │ • Replace│ │ • Replace│ │ • Replace││          │   │
│  │         │ │ • Toast │  │ • Toast │  │ • Toast ││           │   │
│  │         │ └─────────┘  └─────────┘  └─────────┘│           │   │
│  │         └───────────────────────────────────────┘           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            Chrome Storage Local                          │    │
│  │  • quicktype_oauth_token                                │    │
│  │  • quicktype_token_expiry                               │    │
│  │  • quicktype_refresh_token                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                │ HTTPS Requests with
                                │ Bearer Token Authentication
                                ▼
        ┌────────────────────────────────────────┐
        │      Firebase Authentication           │
        │      (auth.firebase.google.com)        │
        │                                        │
        │  Services:                             │
        │  • Google OAuth 2.0 Provider           │
        │  • ID Token Generation                 │
        │  • Token Refresh                       │
        │  • User Management                     │
        └────────────────┬───────────────────────┘
                         │
                         │ Firebase ID Token
                         ▼
        ┌────────────────────────────────────────┐
        │    Express Backend Server              │
        │    (slash-backend-73zn.onrender.com)   │
        │                                        │
        │  API Endpoints:                        │
        │  ┌──────────────────────────────────┐ │
        │  │ POST /api/user/sync              │ │
        │  │ GET  /api/snippets               │ │
        │  │ POST /api/snippets               │ │
        │  │ PUT  /api/snippets/:id           │ │
        │  │ DELETE /api/snippets/:id         │ │
        │  │ POST /api/snippets/:id/usage     │ │
        │  │ GET  /api/test                   │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        │  Database:                             │
        │  • User profiles                       │
        │  • Snippets with metadata              │
        │  • Usage tracking                      │
        └────────────────────────────────────────┘
```

---

## Component Responsibilities

### 1. Popup UI (`popup.tsx`)

**Location:** `/Users/deevee/Projects/quick-type/popup.tsx` (847 lines)

**Primary Role:** User interface for snippet management

#### Key Responsibilities:
- **Authentication UI**
  - Login screen with Google OAuth button
  - User profile display with avatar
  - Logout functionality

- **Snippet Management**
  - Display snippet list with metadata
  - Create new snippets (keyword + value)
  - Edit existing snippets
  - Delete snippets with animation

- **Sorting & Filtering**
  - Sort by recent usage (default)
  - Sort by usage count
  - Sort alphabetically (A-Z)

- **Statistics Display**
  - Total usage count across all snippets
  - Total number of shortcuts
  - Most used shortcut identification

- **UI State Management**
  - Selected item tracking
  - Edit mode vs view mode
  - Loading and saving states
  - Right panel visibility (dynamic width)

#### State Variables:
```typescript
// popup.tsx lines 28-45
const [items, setItems] = useState<SnippetWithMetadata[]>([])
const [selectedItem, setSelectedItem] = useState<SnippetWithMetadata | null>(null)
const [keyword, setKeyword] = useState("/")
const [value, setValue] = useState("")
const [isEditing, setIsEditing] = useState(false)
const [deletingItems, setDeletingItems] = useState(new Set())
const [showLoginAnimation, setShowLoginAnimation] = useState(false)
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)
const [user, setUser] = useState(null)
const [isLoading, setIsLoading] = useState(false)
const [sortBy, setSortBy] = useState<"recent" | "usage" | "alphabetical">("recent")
const [showStats, setShowStats] = useState(false)
const [showRightPanel, setShowRightPanel] = useState(false)
```

#### Communication Pattern:
```typescript
// Sending messages to background
chrome.runtime.sendMessage({ type: "LOGIN" })
chrome.runtime.sendMessage({ type: "SAVE_SNIPPET", keyword, value })
chrome.runtime.sendMessage({ type: "GET_USER" })

// Receiving messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "USER_STATE_CHANGED") {
    setUser(message.user)
    setItems(message.snippetsWithMetadata)
  }
  if (message.type === "USAGE_UPDATED") {
    // Update local usage count
  }
})
```

---

### 2. Background Service Worker (`background.ts`)

**Location:** `/Users/deevee/Projects/quick-type/background.ts` (971 lines)

**Primary Role:** Central hub for authentication, API communication, and state management

#### Key Responsibilities:
- **Authentication Management**
  - Firebase Auth initialization
  - Google OAuth token management
  - Token storage in Chrome local storage
  - Auto-refresh (every 30 minutes)
  - Silent authentication attempts

- **API Communication**
  - All HTTP requests to Express backend
  - Bearer token authentication
  - Request/response handling
  - Error management

- **Global State Management**
  - Current user object
  - Snippet cache (in-memory)
  - Snippet metadata (usage counts, lastUsed, docIds)
  - Loading states

- **Message Routing**
  - Handle messages from popup
  - Handle messages from content scripts
  - Broadcast updates to all tabs

- **Data Synchronization**
  - Sync snippets on login
  - Sync user profile to backend
  - Broadcast snippet updates
  - Broadcast usage updates

#### Global State:
```typescript
// background.ts lines 238-245
let currentUser: any = null
let userSnippets: Record<string, string> = {}
let snippetMetadata: Record<
  string,
  { docId: string; usageCount: number; lastUsed?: Date }
> = {}
let isLoading = false
```

#### Key Functions:
- `handleLogin()` - OAuth authentication flow (lines 469-533)
- `handleLogout()` - Sign out and cleanup (lines 536-562)
- `makeApiCall()` - API request wrapper (lines 51-81)
- `loadUserSnippets()` - Fetch snippets from backend (lines 248-286)
- `incrementUsageCount()` - Track snippet usage (lines 289-343)
- `saveSnippetToExpressServer()` - Create snippet (lines 601-656)
- `updateSnippetInExpressServer()` - Update snippet (lines 659-716)
- `deleteSnippetFromExpressServer()` - Delete snippet (lines 719-771)

#### Message Handler:
```typescript
// background.ts lines 774-903
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "LOGIN":
      handleLogin().then(sendResponse)
      return true // Keep channel open for async response

    case "GET_SNIPPETS":
      sendResponse({
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
      break

    case "INCREMENT_USAGE":
      incrementUsageCount(message.keyword)
      sendResponse({ success: true })
      break

    // ... more cases
  }
})
```

---

### 3. Content Script (`content.tsx`)

**Location:** `/Users/deevee/Projects/quick-type/content.tsx` (1123 lines)

**Primary Role:** Detect inputs and perform text replacement on all web pages

#### Key Responsibilities:
- **Input Detection (5-layer strategy)**
  - Event listeners (input, keyup, paste, blur, change)
  - Focus tracking
  - Mutation Observer for dynamic content
  - Polling (every 1 second)
  - Periodic scanning (every 10 seconds)

- **Text Replacement**
  - Keyword matching with regex
  - Text substitution
  - Cursor position preservation
  - Synthetic event dispatching for React/Vue

- **User Notifications**
  - Toast notification system
  - Web Audio API sound generation
  - Usage count display

- **Usage Tracking**
  - Increment usage count on replacement
  - Optimistic UI updates
  - Send INCREMENT_USAGE message to background

- **State Synchronization**
  - Listen for snippet updates from background
  - Update local snippet cache
  - Handle user login/logout events

#### Component State:
```typescript
// content.tsx lines 16-26
const [snippets, setSnippets] = useState(globalSnippets)
const [isInitialized, setIsInitialized] = useState(false)
const [user, setUser] = useState(null)
const [usageCounts, setUsageCounts] = useState<Record<string, number>>({})
const [isCheckingAuth, setIsCheckingAuth] = useState(true)
```

#### Key Functions:
- `processInput()` - Text replacement engine (lines 507-657)
- `processContentEditable()` - Handle rich text inputs (lines 683-783)
- `createToast()` - Toast notification system (lines 317-504)
- `playNotificationSound()` - Web Audio API sound (lines 262-314)
- `incrementUsageCount()` - Usage tracking (lines 61-71)
- `isValidInput()` - Input validation (lines 660-680)

#### Message Listener:
```typescript
// content.tsx lines 132-230
const handleMessage = (message: any) => {
  switch (message.type) {
    case "USER_LOGIN":
      setUser(message.user)
      if (message.snippets) {
        globalSnippets = message.snippets
        setSnippets(message.snippets)
      }
      break

    case "USER_LOGOUT":
      setUser(null)
      globalSnippets = {"/email": "Please Login Quick Type Chrome Extension"}
      setSnippets(globalSnippets)
      break

    case "SNIPPETS_UPDATED":
      if (message.snippets) {
        globalSnippets = message.snippets
        setSnippets(message.snippets)
      }
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

---

## State Management

### Background Script State (Source of Truth)

```typescript
// Global state in background.ts
┌──────────────────────────────────────────────────────┐
│  currentUser: {                                      │
│    uid: string                                       │
│    email: string                                     │
│    displayName: string                               │
│    photoURL?: string                                 │
│  }                                                   │
├──────────────────────────────────────────────────────┤
│  userSnippets: {                                     │
│    "/email": "john@example.com",                     │
│    "/phone": "+1 555-123-4567",                      │
│    ...                                               │
│  }                                                   │
├──────────────────────────────────────────────────────┤
│  snippetMetadata: {                                  │
│    "/email": {                                       │
│      docId: "doc_123",                              │
│      usageCount: 42,                                │
│      lastUsed: Date("2025-12-26T10:30:00Z")         │
│    },                                                │
│    ...                                               │
│  }                                                   │
├──────────────────────────────────────────────────────┤
│  isLoading: boolean                                  │
└──────────────────────────────────────────────────────┘
```

### State Flow Pattern

```
User Action (Popup/Content)
        │
        ▼
  Send Message to Background
        │
        ▼
  Background Updates Global State
        │
        ▼
  Background Makes API Call (if needed)
        │
        ▼
  Background Broadcasts Update
        │
        ├──────────────────┬──────────────────┐
        ▼                  ▼                  ▼
     Popup UI        Content Script 1  Content Script N
    Updates State    Updates State     Updates State
```

### State Synchronization Strategy

1. **Single Source of Truth:** Background script maintains authoritative state
2. **Optimistic Updates:** UI updates immediately, confirmed by backend
3. **Broadcast Mechanism:** Changes broadcast to all tabs
4. **Event-Driven:** Components react to messages, not polls

---

## Data Flow Patterns

### Pattern 1: User Login Flow

```
┌──────────┐
│  User    │ Clicks "Sign in with Google"
└────┬─────┘
     │
     ▼
┌──────────────────┐
│   Popup UI       │ Sends LOGIN message
└────┬─────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────┐
│   Background Script                                       │
│                                                           │
│   1. chrome.identity.getAuthToken({ interactive: true }) │
│   2. Google OAuth consent screen opens                   │
│   3. User grants permission                              │
│   4. OAuth token retrieved                               │
│   5. Token stored in Chrome local storage                │
│   6. Firebase signInWithCredential(GoogleAuthProvider)   │
│   7. Firebase onAuthStateChanged triggered               │
│   8. loadUserSnippets() called                           │
│   9. syncUserToBackend() called                          │
└────┬──────────────────────────────────────────────────────┘
     │
     ├──────────────────────┬───────────────────────┐
     ▼                      ▼                       ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  Popup   │      │ Content Tab1 │      │ Content TabN │
│          │      │              │      │              │
│ Receives │      │ Receives     │      │ Receives     │
│ USER_    │      │ USER_LOGIN   │      │ USER_LOGIN   │
│ STATE_   │      │ message      │      │ message      │
│ CHANGED  │      │              │      │              │
└──────────┘      └──────────────┘      └──────────────┘
```

**Code References:**
- Popup sends LOGIN: `popup.tsx:373`
- Background handles: `background.ts:786`
- handleLogin function: `background.ts:469-533`
- OAuth token storage: `background.ts:96-106`

---

### Pattern 2: Creating a Snippet

```
┌──────────┐
│  User    │ Fills form: keyword="/email", value="user@example.com"
└────┬─────┘ Clicks "Save Changes"
     │
     ▼
┌──────────────────────────────────────────────────────┐
│   Popup UI                                           │
│   1. Validates keyword and value                     │
│   2. Checks for duplicates                           │
│   3. Sets saving = true                              │
│   4. Sends SAVE_SNIPPET message                      │
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│   Background Script                                   │
│   1. Receives SAVE_SNIPPET message                   │
│   2. Calls saveSnippetToExpressServer()              │
│   3. makeApiCall("POST /api/snippets", {             │
│        keyword: "/email",                            │
│        value: "user@example.com",                    │
│        usageCount: 0,                                │
│        lastUsed: null                                │
│      })                                              │
│   4. Express server creates snippet in database      │
│   5. Returns { success: true, snippet: {...} }       │
│   6. Calls loadUserSnippets() to refresh cache       │
│   7. Updates userSnippets and snippetMetadata        │
│   8. Broadcasts SNIPPETS_UPDATED to all tabs         │
└────┬─────────────────────────────────────────────────┘
     │
     ├──────────────────────┬───────────────────────┐
     ▼                      ▼                       ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  Popup   │      │ Content Tab1 │      │ Content TabN │
│          │      │              │      │              │
│ Updates  │      │ Updates      │      │ Updates      │
│ items    │      │ snippets     │      │ snippets     │
│ array    │      │ cache        │      │ cache        │
└──────────┘      └──────────────┘      └──────────────┘
```

**Code References:**
- Popup saveCurrentItem: `popup.tsx:228-325`
- Popup sends message: `popup.tsx:272-276`
- Background handler: `background.ts:814-818`
- saveSnippetToExpressServer: `background.ts:601-656`
- API call: `background.ts:611-619`
- Broadcast update: `background.ts:627-641`

---

### Pattern 3: Using a Snippet (Text Replacement)

```
┌──────────┐
│  User    │ Types "/email" in any input field on example.com
└────┬─────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│   Content Script (example.com tab)                   │
│   1. Input event detected via event listener         │
│   2. processInput() called with 150ms debounce       │
│   3. Checks if value includes "/email"               │
│   4. Matches found: replaces with "user@example.com" │
│   5. Preserves cursor position                       │
│   6. Dispatches synthetic events for React/Vue       │
│   7. Shows toast notification with usage count       │
│   8. Plays notification sound (Web Audio API)        │
│   9. Optimistically increments local usage count     │
│   10. Sends INCREMENT_USAGE message                  │
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│   Background Script                                   │
│   1. Receives INCREMENT_USAGE message                │
│   2. Gets docId from snippetMetadata                 │
│   3. makeApiCall("POST /api/snippets/:id/usage")     │
│   4. Express server increments count in database     │
│   5. Updates local snippetMetadata                   │
│   6. Broadcasts USAGE_UPDATED to all tabs            │
└────┬─────────────────────────────────────────────────┘
     │
     ├──────────────────────┬───────────────────────┐
     ▼                      ▼                       ▼
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  Popup   │      │ Content Tab1 │      │ Content TabN │
│          │      │              │      │              │
│ Updates  │      │ Updates      │      │ Updates      │
│ usage    │      │ usage        │      │ usage        │
│ count    │      │ count        │      │ count        │
└──────────┘      └──────────────┘      └──────────────┘
```

**Code References:**
- Input event listener: `content.tsx:839`
- processInput function: `content.tsx:507-657`
- Text replacement: `content.tsx:531-540`
- Toast creation: `content.tsx:647`
- INCREMENT_USAGE sent: `content.tsx:651`
- Background handler: `background.ts:832-835`
- incrementUsageCount: `background.ts:289-343`
- Broadcast update: `background.ts:315-338`

---

## Message Passing Architecture

### Message Types & Handlers

| Message Type | Sender | Receiver | Response | Purpose |
|-------------|--------|----------|----------|---------|
| `LOGIN` | Popup | Background | `{success, error}` | Initiate Google OAuth |
| `LOGOUT` | Popup | Background | `{success, error}` | Sign out user |
| `GET_USER` | Popup/Content | Background | `{user, snippets, snippetsWithMetadata}` | Get current auth state |
| `GET_SNIPPETS` | Popup/Content | Background | `{snippets, snippetsWithMetadata}` | Fetch snippet cache |
| `SAVE_SNIPPET` | Popup | Background | `{success, docId, error}` | Create new snippet |
| `UPDATE_SNIPPET` | Popup | Background | `{success, docId, error}` | Update existing snippet |
| `DELETE_SNIPPET` | Popup | Background | `{success, error}` | Delete snippet |
| `INCREMENT_USAGE` | Content | Background | `{success}` | Track snippet usage |
| `REFRESH_SNIPPETS` | Any | Background | `{success, snippets}` | Force reload from backend |
| `GET_USAGE_STATS` | Popup | Background | `{stats, totalUsage}` | Get usage analytics |
| `TEST_BACKGROUND` | Popup | Background | `{success, message}` | Health check |
| `TEST_BACKEND` | Popup | Background | `{success, message}` | Backend connectivity |
| `USER_STATE_CHANGED` | Background | Popup/Content | Broadcast | User login/logout event |
| `SNIPPETS_UPDATED` | Background | Content | Broadcast | Snippet list changed |
| `USAGE_UPDATED` | Background | Popup/Content | Broadcast | Usage count changed |
| `USER_LOGIN` | Background | Content | Broadcast | User authenticated |
| `USER_LOGOUT` | Background | Content | Broadcast | User signed out |

### Broadcasting Pattern

```typescript
// background.ts - Broadcasting to all tabs
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SNIPPETS_UPDATED",
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      }).catch(() => {
        // Tab might not have content script, ignore errors
      })
    }
  })
})
```

**Code Reference:** `background.ts:412-431`, `background.ts:627-641`

---

## Authentication Flow

### Complete OAuth Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Action                               │
│              Clicks "Sign in with Google"                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Chrome Identity API                             │
│   chrome.identity.getAuthToken({ interactive: true })       │
│                                                              │
│   1. Opens Google OAuth consent screen                      │
│   2. User selects Google account                            │
│   3. Grants email and profile permissions                   │
│   4. Returns OAuth access token                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Token Storage (Chrome Local Storage)           │
│   storeOAuthToken(token)                                    │
│                                                              │
│   {                                                          │
│     quicktype_oauth_token: "ya29.a0AfH6SMB...",            │
│     quicktype_token_expiry: 1703606400000  // 50 min        │
│   }                                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Authentication                         │
│   const credential = GoogleAuthProvider.credential(null, token) │
│   await signInWithCredential(auth, credential)              │
│                                                              │
│   Firebase validates token with Google                      │
│   Returns Firebase User object                              │
│   Triggers onAuthStateChanged()                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Background Script - onAuthStateChanged          │
│   1. Sets currentUser = user                                │
│   2. Calls syncUserToBackend(user)                          │
│   3. Calls loadUserSnippets(user.uid)                       │
│   4. Broadcasts USER_STATE_CHANGED to popup                 │
│   5. Broadcasts USER_LOGIN to all content scripts           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Backend - User Sync                     │
│   POST /api/user/sync                                       │
│   Authorization: Bearer <Firebase ID Token>                 │
│                                                              │
│   Body:                                                      │
│   {                                                          │
│     uid: "firebase_user_id",                                │
│     email: "user@example.com",                              │
│     displayName: "John Doe",                                │
│     photoURL: "https://...",                                │
│     lastLoginAt: "2025-12-26T10:30:00Z"                     │
│   }                                                          │
│                                                              │
│   Server creates/updates user record                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Backend - Load Snippets                 │
│   GET /api/snippets                                         │
│   Authorization: Bearer <Firebase ID Token>                 │
│                                                              │
│   Returns:                                                   │
│   {                                                          │
│     success: true,                                           │
│     snippets: [                                              │
│       {                                                      │
│         id: "doc_123",                                       │
│         keyword: "/email",                                   │
│         value: "user@example.com",                           │
│         usageCount: 42,                                      │
│         lastUsed: "2025-12-26T09:15:00Z"                    │
│       },                                                     │
│       ...                                                    │
│     ]                                                        │
│   }                                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              UI Update                                       │
│   Popup shows authenticated view                            │
│   Content scripts ready to replace text                     │
│   User can start creating/using snippets                    │
└─────────────────────────────────────────────────────────────┘
```

**Code References:**
- handleLogin: `background.ts:469-533`
- storeOAuthToken: `background.ts:96-106`
- onAuthStateChanged: `background.ts:384-464`
- syncUserToBackend: `background.ts:361-380`
- loadUserSnippets: `background.ts:248-286`

---

## Snippet Lifecycle

### Create → Use → Delete

```
┌──────────────┐
│   CREATE     │
└──────┬───────┘
       │
       ▼
  User fills form in popup
  keyword: "/email"
  value: "user@example.com"
       │
       ▼
  SAVE_SNIPPET message → Background
       │
       ▼
  POST /api/snippets
  {keyword, value, usageCount: 0, lastUsed: null}
       │
       ▼
  Database: Insert new document
  Returns: {id: "doc_123", ...}
       │
       ▼
  Background refreshes cache
  userSnippets["/email"] = "user@example.com"
  snippetMetadata["/email"] = {docId: "doc_123", usageCount: 0}
       │
       ▼
  Broadcast SNIPPETS_UPDATED to all tabs
       │
       ▼
┌──────────────┐
│   READY      │ Snippet available for use
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    USE       │
└──────┬───────┘
       │
       ▼
  User types "/email" in input field
       │
       ▼
  Content script detects keyword
  Replaces with "user@example.com"
       │
       ▼
  Shows toast notification
  usageCount: 1
       │
       ▼
  INCREMENT_USAGE message → Background
       │
       ▼
  POST /api/snippets/doc_123/usage
       │
       ▼
  Database: usageCount++, lastUsed = now()
       │
       ▼
  Background updates metadata
  snippetMetadata["/email"].usageCount = 1
  snippetMetadata["/email"].lastUsed = Date("2025-12-26...")
       │
       ▼
  Broadcast USAGE_UPDATED to all tabs
       │
       ▼
  Popup/Content UIs update usage count
       │
       ▼
  (Repeat for each use)
       │
       ▼
┌──────────────┐
│   DELETE     │
└──────┬───────┘
       │
       ▼
  User clicks delete button in popup
       │
       ▼
  Deletion animation (300ms)
       │
       ▼
  DELETE_SNIPPET message → Background
       │
       ▼
  DELETE /api/snippets/doc_123
       │
       ▼
  Database: Remove document
       │
       ▼
  Background refreshes cache
  delete userSnippets["/email"]
  delete snippetMetadata["/email"]
       │
       ▼
  Broadcast SNIPPETS_UPDATED to all tabs
       │
       ▼
  Popup removes from items array
  Content scripts remove from cache
       │
       ▼
┌──────────────┐
│   DELETED    │ Snippet no longer available
└──────────────┘
```

---

## Real-time Synchronization

### Multi-Tab Synchronization

```
Tab 1: gmail.com        Tab 2: linkedin.com      Tab 3: twitter.com
     │                        │                        │
     │ User types "/email"    │                        │
     ▼                        │                        │
Content Script              │                        │
  Replaces text              │                        │
  INCREMENT_USAGE ──────────►Background◄──────────────┘
                             Service Worker
                                  │
                     API: POST /api/snippets/:id/usage
                                  │
                         Database: usageCount++
                                  │
                      Update snippetMetadata
                                  │
                  Broadcast USAGE_UPDATED to all tabs
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
      ▼                           ▼                           ▼
   Popup UI               Content Script 1           Content Script N
(if open)                 (All open tabs)            (All open tabs)
      │                           │                           │
Update usage count       Update usage count         Update usage count
in items array           in usageCounts state       in usageCounts state
```

### Token Auto-Refresh

```
Timer: Every 30 minutes
       │
       ▼
Background Script
setInterval(refreshOAuthToken, 30 * 60 * 1000)
       │
       ▼
Check if user is authenticated
       │
       ├─── No user ──► Skip
       │
       └─── User exists ──►
              │
              ▼
     chrome.identity.getAuthToken({ interactive: false })
              │
              ├─── Success ──► Store new token
              │
              └─── Failure ──► Next cycle will retry
```

**Code Reference:** `background.ts:957-968`

---

## Interview Q&A

### Q1: Why use a service worker instead of a background page?
**A:** Manifest V3 requires service workers for background scripts. Key differences:
- **Event-driven:** Service workers wake up on events, don't run continuously
- **Better performance:** Reduces memory usage and battery consumption
- **Limited lifetime:** Must complete work quickly (typically 30 seconds)
- **No DOM access:** Cannot use window or document objects
- **Modern standard:** Required for all new Chrome extensions

### Q2: How do you handle service worker termination?
**A:**
- **In-memory state:** Stored in global variables (currentUser, userSnippets)
- **Persistence:** Critical data (OAuth token) stored in chrome.storage.local
- **Rehydration:** On restart, attempt silent authentication from stored token
- **Event listeners:** Registered immediately when worker starts
- **Async completion:** Use `return true` in message handlers to keep channel open

**Code:** `background.ts:96-106` (token storage), `background.ts:182-199` (reauth)

### Q3: How does the extension ensure all content scripts receive updates?
**A:** Broadcasting pattern:
```typescript
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {})
    }
  })
})
```
- Queries all tabs
- Sends message to each tab's content script
- Catches errors (tab might not have content script)
- Ensures eventual consistency across all tabs

**Code:** `background.ts:412-431`, `background.ts:574-588`

### Q4: What happens if the API call fails during snippet creation?
**A:**
- User sees error alert: `popup.tsx:290`
- Snippet not added to local state
- Database remains unchanged
- User can retry the operation
- No partial state updates

### Q5: How do you prevent race conditions in usage count updates?
**A:**
- **Optimistic updates:** Content script immediately increments local count
- **Backend update:** Sent asynchronously via INCREMENT_USAGE message
- **Broadcast reconciliation:** Backend broadcasts authoritative count
- **Max logic:** Use Math.max() to prevent overwriting higher values
  ```typescript
  setUsageCounts(prev => ({
    ...prev,
    [keyword]: Math.max(prev[keyword] || 0, message.usageCount)
  }))
  ```

**Code:** `content.tsx:213-223`

### Q6: Why store snippets in both background and content scripts?
**A:**
- **Background:** Source of truth, survives tab closes, handles API sync
- **Content:** Performance optimization, reduces message passing overhead
- **Synchronization:** Changes broadcast from background to content scripts
- **Offline capability:** Content scripts can work with cached snippets

### Q7: How does the extension handle newly opened tabs?
**A:**
```typescript
// background.ts:906-926
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && currentUser) {
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: "USER_LOGIN",
        user: currentUser,
        snippets: userSnippets,
        snippetsWithMetadata: getSnippetsWithMetadata()
      })
    }, 1000) // Delay ensures content script is loaded
  }
})
```
- Listens for tab completion
- Sends USER_LOGIN message with current state
- 1-second delay ensures content script initialization
- Keeps all tabs in sync

---

**Next:** See [API_INTEGRATION.md](./API_INTEGRATION.md) for backend communication details.
