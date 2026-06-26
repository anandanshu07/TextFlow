# TextFlow - Chrome Extension

A smart Chrome Extension for creating, organizing and instantly inserting reusable text snippets using custom keyboard shortcuts.

---

## Features

- 🔐 Google Authentication using Firebase
- 📝 Create, edit and delete snippets
- ⚡ Instant text expansion using shortcuts
- ☁️ Cloud synchronization across devices
- 📊 Usage analytics for snippets
- 🔄 Secure JWT-based backend authentication
- 💾 Offline support with cached data

---

## Tech Stack

### Frontend
- TypeScript
- React
- Plasmo Framework
- Tailwind CSS

### Backend
- Express.js
- MongoDB
- Firebase Authentication
- JWT Authentication

---

## Architecture

TextFlow uses Firebase Authentication for secure Google Sign-In. After successful authentication, the Firebase ID token is exchanged for backend-issued JWT tokens that securely authenticate API requests.

User snippets are stored in MongoDB and synchronized through Express APIs, allowing access from multiple devices while maintaining secure authentication.

---

## Screenshots

### Login Screen

<img src="assets/screenshots/login.png" width="700"/>

### Dashboard

<img src="assets/screenshots/dashboard.png" width="700"/>

### Create Snippet

<img src="assets/screenshots/create-snippet.png" width="700"/>

### Snippet Expansion

<img src="assets/screenshots/snippet-demo.png" width="700"/>

---

## Installation

### Clone Repository

```bash
git clone https://github.com/anandanshu07/TextFlow.git
cd TextFlow
```

### Install Dependencies

```bash
npm install
```

### Create Environment File

Create a `.env` file in the root directory.

```env
PLASMO_PUBLIC_FIREBASE_PUBLIC_API_KEY=your-api-key
PLASMO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
PLASMO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
PLASMO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
PLASMO_PUBLIC_FIREBASE_APP_ID=your-app-id

PLASMO_PUBLIC_BACKEND_URL=http://localhost:5000
```

### Start Development

```bash
npm run dev
```

---

## Production Build

```bash
npm run build
```

The production extension will be generated inside

```
build/chrome-mv3-prod/
```

---

## Project Structure

```
TextFlow
│
├── assets/
├── components/
├── firebase/
├── background.ts
├── content.tsx
├── popup.tsx
├── package.json
├── tsconfig.json
└── build/
```

---

## Future Improvements

- AI-powered snippet suggestions
- Folder based organization
- Rich text snippets
- Import / Export snippets
- Keyboard shortcut customization
- Chrome Web Store release

---

## Resume Highlights

- Developed a Chrome Extension using React, TypeScript and Plasmo Framework.
- Implemented secure Google Authentication using Firebase and JWT.
- Built REST APIs with Express.js and MongoDB for cloud synchronization.
- Added CRUD operations, usage analytics and offline support.
- Designed a responsive extension UI with reusable React components.

---

## License

MIT License

---

## Acknowledgements

This project is inspired by the open-source **Slash** project and has been extended with custom branding, UI improvements, authentication enhancements and backend modifications.

---

## Credits

This project is based on the open-source **Slash** project originally created by **Divyansh Vishwakarma (deevee47)**.

I customized and extended the project by:
- Rebranding the extension as TextFlow
- Redesigning the UI
- Modifying the authentication flow
- Improving backend integration
- Updating documentation and project structure

Original project:
https://github.com/deevee47/slash

---

## Author

**Anand Anshu**

GitHub: https://github.com/anandanshu07
