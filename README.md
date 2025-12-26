# Slash - Chrome Extension

A powerful Chrome extension for managing text snippets and shortcuts with backend-controlled JWT authentication.

## Overview

Slash is a Chrome extension that allows users to create, manage, and quickly insert text snippets using custom shortcuts. Built with modern web technologies and featuring a secure, backend-controlled authentication system that ensures scalability and proper session management.

## Features

- 🔐 **Secure Authentication** - Google Sign-In via Firebase with backend-controlled JWT tokens
- 📝 **Snippet Management** - Create, edit, and delete text snippets
- ⚡ **Quick Access** - Insert snippets using custom keyboard shortcuts
- 🔄 **Auto Token Refresh** - Seamless token rotation with 180-day validity
- 📊 **Usage Tracking** - Monitor snippet usage statistics
- 🌐 **Cross-Device Sync** - Snippets synced across all your devices
- 💾 **Offline Support** - Works with cached tokens when offline

## Architecture

### Authentication Flow

Slash uses a hybrid authentication approach: **Firebase for identity verification** and **backend-controlled JWT tokens** for session management.

#### Login Flow

```
1. User clicks "Sign in with Google"
   ↓
2. chrome.identity.getAuthToken() → Google OAuth token
   ↓
3. Firebase signInWithCredential() → Firebase ID token
   ↓
4. POST /auth/firebase → Exchange for backend JWT tokens
   ↓
5. signOut() from Firebase (cleanup, no session stored)
   ↓
6. Store backend tokens in chrome.storage.local
   ↓
7. Load user data from backend using JWT
```

#### API Request Flow

```
1. getBackendAccessToken() → Retrieve from storage
   ↓
2. Check expiry (15-minute access tokens)
   ↓
3. Auto-refresh if expired (5-second buffer)
   ↓
4. makeApiCall() with Bearer token
   ↓
5. On 401: Refresh token → Retry request automatically
```

#### Token Refresh Flow

```
1. POST /auth/refresh with refresh token
   ↓
2. Backend validates and rotates tokens
   ↓
3. Store new access token + new refresh token (rotated)
   ↓
4. Continue API request seamlessly
```

#### Logout Flow

```
1. POST /auth/logout to revoke backend tokens
   ↓
2. Clear chrome.storage.local
   ↓
3. Clear Firebase session
   ↓
4. Reset UI state
```

### Token Management

- **Access Token**: JWT, 15-minute expiry, stored in `chrome.storage.local`
- **Refresh Token**: HMAC-SHA256 hashed, 180-day expiry, rotated on every refresh
- **Auto-Refresh**: 5-second buffer before expiry prevents request failures
- **Retry Logic**: 401 errors automatically trigger token refresh and request retry

### Security Features

- ✅ Firebase tokens **never stored** (only used during login flow)
- ✅ OAuth tokens cleared immediately after use
- ✅ Backend tokens encrypted in `chrome.storage.local`
- ✅ Automatic token refresh with rotation (security best practice)
- ✅ 401 errors trigger re-authentication flow
- ✅ Logout revokes tokens on backend (prevents token reuse)
- ✅ Rate limiting on auth endpoints (prevents brute force)
- ✅ HMAC-SHA256 for refresh tokens (constant-time lookup, scales to millions)

## Tech Stack

### Extension (Frontend)

- **Framework**: [Plasmo](https://www.plasmo.com/) v0.90.5 (Chrome Extension MV3)
- **UI Library**: React 18.2.0
- **Language**: TypeScript 5.3.3
- **Authentication**: Firebase Auth (Google OAuth provider only)
- **APIs**: chrome.identity, chrome.storage.local, chrome.runtime

### Backend (Separate Repository)

- **Server**: Express.js
- **Database**: MongoDB (users, refreshTokens collections)
- **Auth**: Firebase Admin SDK (token verification)
- **Tokens**: jsonwebtoken (JWT generation)
- **Hashing**: HMAC-SHA256 (refresh token security)

## Setup

### Prerequisites

- Node.js 16+
- Firebase project with Google Sign-In enabled
- Backend server running (see [backend repository](https://github.com/deevee47/slash-backend))

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd quick-type
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root (copy from `.env.example`):

   ```bash
   # Firebase Configuration
   PLASMO_PUBLIC_FIREBASE_PUBLIC_API_KEY=your-api-key
   PLASMO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   PLASMO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   PLASMO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   PLASMO_PUBLIC_FIREBASE_APP_ID=your-app-id
   PLASMO_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

   # Backend Server URL
   PLASMO_PUBLIC_BACKEND_URL=http://localhost:5000
   ```

   For production, update `PLASMO_PUBLIC_BACKEND_URL` to your production backend URL.

4. **Run development server**

   ```bash
   npm run dev
   ```

5. **Load extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build/chrome-mv3-dev` folder

### Production Build

```bash
npm run build
```

This creates a production bundle in `build/chrome-mv3-prod/` ready for Chrome Web Store submission.

## Backend Requirements

The extension requires a backend server with the following API endpoints:

### Authentication Endpoints

- `POST /auth/firebase` - Exchange Firebase ID token for backend JWT tokens

  - **Request**: `Authorization: Bearer <firebase-id-token>`
  - **Response**: `{ accessToken, refreshToken, expiresIn }`

- `POST /auth/refresh` - Refresh access token (with rotation)

  - **Request**: `Authorization: Bearer <refresh-token>`
  - **Response**: `{ accessToken, refreshToken, expiresIn }`

- `POST /auth/logout` - Revoke refresh token
  - **Request**: `Authorization: Bearer <refresh-token>`
  - **Response**: `{ success: true }`

### User Endpoints

- `GET /api/user/me` - Get current authenticated user
  - **Request**: `Authorization: Bearer <access-token>`
  - **Response**: `{ user: { firebaseUid, email, displayName, ... } }`

### Snippet Endpoints

- `GET /api/snippets` - List all user snippets
- `POST /api/snippets` - Create new snippet
  - **Body**: `{ keyword, value, usageCount, lastUsed }`
- `PUT /api/snippets/:id` - Update existing snippet
  - **Body**: `{ keyword, value }`
- `DELETE /api/snippets/:id` - Delete snippet
- `POST /api/snippets/:id/usage` - Increment usage count

See the backend repository for detailed setup instructions and implementation.

## Development

### Commands

```bash
npm run dev          # Start development server with HMR
npm run build        # Create production build
```

## Project Structure

```
quick-type/
├── background.ts              # Service worker with auth logic
├── popup.tsx                  # Extension popup UI
├── content.tsx                # Content script for snippet injection
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── .env                       # Firebase configuration (not in git)
├── .env.example               # Example environment variables
└── build/
    ├── chrome-mv3-dev/        # Development build
    └── chrome-mv3-prod/       # Production build
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---
## Author
**deevee47** [(Portfolio)](https://www.itsdivyansh.com)
