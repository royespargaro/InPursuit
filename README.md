# InPursuit

InPursuit is a local-first personal execution workspace for life areas, goals, projects, habits, tasks, and daily reviews, with optional Google Sign-In and Firebase Firestore cloud sync.

## Run locally

1. Install dependencies with `npm install`.
2. Start the development server with `npm run dev` (serves on port `3000`).

## Production build & start

1. Build the client bundle and Node server with `npm run build`.
2. Start the production server with `npm start`.

## Storage & cloud sync

- Without signing in, all data is saved locally in your browser (`localStorage`) and can be exported/restored via versioned JSON backups in Settings.
- Signing in with Google synchronizes your workspace with Firebase Firestore across devices while keeping a local cached copy for offline resilience.