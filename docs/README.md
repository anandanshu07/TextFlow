# Quick Type - Chrome Extension Documentation

> **Your shortcuts for everything you type.**
> Turn frequently typed phrases, emails, and links into simple slash (/) shortcuts. Save time and reduce errors with every keystroke.

---

## 📚 Documentation Index

This documentation is organized into multiple sections for comprehensive understanding:

1. **[README.md](./README.md)** (This file) - Project overview and quick start
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and data flow
3. **[API_INTEGRATION.md](./API_INTEGRATION.md)** - Backend API and authentication
4. **[CHROME_APIS.md](./CHROME_APIS.md)** - Chrome extension APIs used
5. **[CODE_DEEP_DIVE.md](./CODE_DEEP_DIVE.md)** - Implementation details and key functions
6. **[USER_WORKFLOWS.md](./USER_WORKFLOWS.md)** - User journeys and workflows
7. **[TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md)** - Advanced implementation details

---

## 🎯 Project Overview

**Quick Type** is a sophisticated Chrome extension built with Plasmo framework that enables users to create keyword-triggered text shortcuts. When you type a keyword like `/email`, it automatically expands to your full email address (example@gmail.com) across any website.

### Key Features

- ✅ **Keyword-based text expansion** - Type `/keyword` to insert predefined text
- ✅ **Cloud synchronization** - Snippets sync across all your devices
- ✅ **Google OAuth authentication** - Secure login via Chrome Identity API
- ✅ **Usage tracking** - Monitor how often you use each shortcut
- ✅ **Smart sorting** - Sort by recent use, frequency, or alphabetically
- ✅ **Universal compatibility** - Works on all HTTPS websites
- ✅ **Real-time notifications** - Toast messages with sound when shortcuts are used
- ✅ **Dark UI theme** - Beautiful gradient interface with animated light rays

---

## 🏗️ Technology Stack

### Frontend
- **Framework:** [Plasmo](https://www.plasmo.com/) v0.90.5 - Modern Chrome extension framework
- **UI Library:** React 18.2.0
- **Language:** TypeScript 5.3.3
- **Styling:** Tailwind CSS 3.4.0 with PostCSS
- **Icons:** Lucide React (22 icons)
- **Effects:**
  - Canvas Confetti - Celebration animations
  - OGL - WebGL light rays effect

### Backend & Services
- **Authentication:** Firebase Auth with Google OAuth2
- **API Server:** Express.js backend hosted on Render
- **Database:** Express server with persistent storage
- **API Base URL:** `https://slash-backend-73zn.onrender.com`

### Chrome Extension
- **Manifest Version:** V3 (latest standard)
- **Service Worker:** Background script for authentication and data management
- **Content Scripts:** Injected into all web pages for snippet detection
- **Popup:** React-based UI for snippet management

---

## 📁 Project Structure

```
quick-type/
├── background.ts              # Service worker (background script)
├── popup.tsx                  # Popup UI component (main interface)
├── content.tsx                # Content script (text replacement)
│
├── components/                # Reusable React components
│   ├── LightRays/
│   │   └── LightRays.tsx     # WebGL animated background effect
│   └── StatefulButton.tsx    # Button with loading/success states
│
├── firebase/                  # Firebase integration
│   ├── index.ts              # Firebase app initialization
│   ├── hook.ts               # useFirebase custom hook
│   └── use-firebase-doc.ts   # Firestore document hook
│
├── assets/
│   └── icon.png              # Extension icon
│
├── style.css                 # Global styles
├── tailwind.config.js        # Tailwind configuration
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies and manifest
├── .env                      # Environment variables (Firebase config)
│
└── docs/                     # Documentation (you are here!)
    ├── README.md
    ├── ARCHITECTURE.md
    ├── API_INTEGRATION.md
    ├── CHROME_APIS.md
    ├── CODE_DEEP_DIVE.md
    ├── USER_WORKFLOWS.md
    └── TECHNICAL_DETAILS.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager
- Google Chrome browser
- Firebase project with Authentication enabled

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd quick-type
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure environment variables:**
   Create a `.env` file with your Firebase configuration:
   ```env
   PLASMO_PUBLIC_FIREBASE_PUBLIC_API_KEY=your_api_key
   PLASMO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   PLASMO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   PLASMO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   PLASMO_PUBLIC_FIREBASE_APP_ID=your_app_id
   PLASMO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
   PLASMO_PUBLIC_FIREBASE_CLIENT_ID=your_oauth_client_id
   ```

4. **Start development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Load extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `build/chrome-mv3-dev` directory

### Building for Production

```bash
npm run build
# or
yarn build
```

The production build will be in `build/chrome-mv3/`.

### Creating Distribution Package

```bash
npm run package
# or
yarn package
```

This creates a `.zip` file ready for Chrome Web Store submission.

---

## 🎨 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Chrome Extension                          │
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐                     │
│  │   Popup UI   │◄────────│  Background  │                     │
│  │   (React)    │ Messages│   Service    │                     │
│  │              │─────────►   Worker     │                     │
│  └──────────────┘         └───────┬──────┘                     │
│                                    │                             │
│                                    │ Messages                    │
│                                    │                             │
│  ┌──────────────────────────────┐ │                            │
│  │    Content Script (React)    │◄┘                            │
│  │   Injected into all pages    │                              │
│  └──────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS Requests
                         ▼
         ┌────────────────────────────────┐
         │     Firebase Authentication    │
         │       (Google OAuth2)          │
         └────────────────────────────────┘
                         │
                         │ ID Token
                         ▼
         ┌────────────────────────────────┐
         │   Express Backend Server       │
         │   (slash-backend.onrender.com) │
         │                                │
         │   Endpoints:                   │
         │   • GET  /api/snippets         │
         │   • POST /api/snippets         │
         │   • PUT  /api/snippets/:id     │
         │   • DELETE /api/snippets/:id   │
         │   • POST /api/snippets/:id/usage│
         │   • POST /api/user/sync        │
         └────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **Popup UI** | `popup.tsx` (847 lines) | User interface for managing snippets, authentication UI, statistics display |
| **Background Script** | `background.ts` (971 lines) | Authentication, API communication, message routing, token management |
| **Content Script** | `content.tsx` (1123 lines) | Input detection, text replacement, toast notifications, usage tracking |

---

## 🔑 Key Concepts

### Snippet Structure
```typescript
interface SnippetWithMetadata {
  keyword: string;      // e.g., "/email"
  value: string;        // e.g., "john@example.com"
  usageCount: number;   // Times this snippet was used
  lastUsed?: Date;      // Last usage timestamp
  docId?: string;       // Database document ID
}
```

### Authentication Flow
1. User clicks "Sign in with Google" in popup
2. Chrome Identity API opens Google OAuth consent screen
3. OAuth token retrieved and stored in Chrome local storage
4. Token used to authenticate with Firebase
5. Firebase ID token sent to Express backend for all API calls
6. Token auto-refreshes every 30 minutes

### Text Replacement Flow
1. Content script detects input on any web page
2. Checks if typed text contains any snippet keywords
3. Replaces keyword with full value
4. Preserves cursor position
5. Triggers synthetic events for React/Vue compatibility
6. Shows toast notification with usage count
7. Increments usage counter in backend

---

## 🎯 Use Cases

### Example Snippets

| Keyword | Replacement | Use Case |
|---------|-------------|----------|
| `/email` | `john.doe@company.com` | Quick email insertion |
| `/phone` | `+1 (555) 123-4567` | Phone number autocomplete |
| `/address` | `123 Main St, City, State 12345` | Shipping address |
| `/meeting` | `https://zoom.us/j/123456789` | Meeting link sharing |
| `/signature` | `Best regards,\nJohn Doe` | Email signatures |

---

## 🔒 Security Features

- **End-to-end encryption** - Snippets stored securely in Firebase
- **OAuth 2.0 authentication** - Industry-standard Google sign-in
- **Token expiry management** - 50-minute token lifecycle with auto-refresh
- **HTTPS-only** - Extension only works on secure websites
- **No password storage** - Leverages Chrome Identity API
- **Minimal permissions** - Only requests necessary Chrome APIs

---

## 📊 Performance Optimizations

- **Debounced input processing** - 150ms delay to prevent excessive checks
- **Efficient message passing** - Direct communication between components
- **Minimal re-renders** - React optimization with proper state management
- **Lazy Firebase initialization** - Firebase only loads when needed
- **Cached snippets** - Background script maintains in-memory cache
- **WebGL animations** - GPU-accelerated light rays effect

---

## 🌐 Browser Compatibility

- ✅ **Google Chrome** - Fully supported (Manifest V3)
- ✅ **Microsoft Edge** - Compatible (Chromium-based)
- ✅ **Brave** - Compatible with minor limitations
- ❌ **Firefox** - Not supported (requires Manifest V2 adaptation)
- ❌ **Safari** - Not supported (different extension API)

---

## 🎨 UI/UX Highlights

### Login Screen
- Beautiful gradient background with animated WebGL light rays
- Centered layout with clear call-to-action
- Google OAuth button with loading states
- End-to-end encryption messaging

### Authenticated View
- **Left Sidebar (320px):**
  - User profile with avatar
  - Snippet list with usage badges
  - Sort options (Recent, Usage, Alphabetical)
  - Add New button

- **Right Panel (430px - expandable):**
  - Edit/Create form for snippets
  - Keyword and value inputs
  - Usage statistics display
  - Save button with loading states

- **Dynamic Width:**
  - 320px (sidebar only)
  - 750px (sidebar + edit panel)
  - Smooth transitions between states

### Toast Notifications
- Fixed position: top-right corner
- Dark theme matching main UI
- Usage count badge overlay
- Animated progress bar (3.2s duration)
- Web Audio API notification sound
- Slide-in/slide-out animations

---

## 🛠️ Development Tips

### Testing the Extension

1. **Console debugging:**
   ```javascript
   // In any web page console
   quickTypeStatus()      // Check extension state
   quickTypeDebug()       // Full debug info
   quickTypeTest()        // Create test input field
   quickTypeTestToast()   // Test notification
   quickTypeTestSound()   // Test audio
   ```

2. **Background script logs:**
   - Open `chrome://extensions/`
   - Find Quick Type extension
   - Click "service worker" link
   - View console logs

3. **Popup debugging:**
   - Right-click extension icon
   - Select "Inspect popup"
   - View React DevTools

---

## 📝 Common Interview Questions

### Q1: Why use Plasmo instead of raw Chrome Extension APIs?
**A:** Plasmo provides:
- Automatic Manifest V3 configuration
- Hot module reloading for faster development
- Built-in React/TypeScript support
- Simplified build process
- Auto-generated manifest.json
- Better developer experience with zero config

### Q2: How does the extension handle different input types?
**A:** The content script uses a **5-layer detection strategy**:
1. Event listeners (input, keyup, paste, blur, change)
2. Focus tracking
3. Mutation Observer for dynamic content
4. Polling (every 1 second)
5. Periodic scanning (every 10 seconds)

This ensures compatibility with React, Vue, Angular, and vanilla JS inputs.

### Q3: How is authentication persisted across browser restarts?
**A:**
- OAuth token stored in Chrome local storage
- Token expiry timestamp tracked
- On extension startup, background script attempts silent authentication
- 3 retry attempts (1s, 3s, 5s delays)
- Falls back to interactive login if token expired

### Q4: What happens when a snippet is used?
**A:**
1. Content script detects keyword in input
2. Replaces text and preserves cursor position
3. Triggers synthetic events for framework compatibility
4. Shows toast notification with usage count
5. Sends INCREMENT_USAGE message to background
6. Background updates count in Express backend
7. Background broadcasts USAGE_UPDATED to all tabs
8. Popup UI updates usage count in real-time

### Q5: How does the extension communicate between components?
**A:** Uses Chrome's message passing API:
- **chrome.runtime.sendMessage()** - Send to background script
- **chrome.tabs.sendMessage()** - Send to specific tab's content script
- **chrome.tabs.query()** + **sendMessage()** - Broadcast to all tabs
- Message types include: LOGIN, LOGOUT, SAVE_SNIPPET, INCREMENT_USAGE, etc.

---

## 🐛 Troubleshooting

### Extension not detecting inputs
- Check if website uses Shadow DOM (not supported)
- Verify content script loaded: `quickTypeStatus()` in console
- Check Chrome console for errors
- Try `quickTypeTest()` to create test input

### Authentication fails
- Verify Firebase configuration in `.env`
- Check OAuth client ID matches Chrome Web Store listing
- Clear stored tokens: `quickTypeClearStorage()`
- Check background script console for errors

### Snippets not syncing
- Verify backend server is running
- Check network tab for API call errors
- Verify Firebase ID token is valid
- Try manual refresh: `quickTypeReload()`

---

## 📚 Next Steps

For detailed technical information, explore the other documentation files:

- **Architecture details:** See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **API documentation:** See [API_INTEGRATION.md](./API_INTEGRATION.md)
- **Chrome APIs usage:** See [CHROME_APIS.md](./CHROME_APIS.md)
- **Code examples:** See [CODE_DEEP_DIVE.md](./CODE_DEEP_DIVE.md)
- **User flows:** See [USER_WORKFLOWS.md](./USER_WORKFLOWS.md)
- **Advanced topics:** See [TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md)

---

## 📄 License

This project is private and proprietary.

## 👨‍💻 Author

**deevee47** [(Portfolio)](https://www.itsdivyansh.com)

---

**Built with ❤️ using Plasmo, React, and Firebase**
