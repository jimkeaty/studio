# Smart Broker USA Dashboard

## Project Identity
- App name: smart-broker-app
- GitHub repo: jimkeaty/studio
- Live site: https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app
- Hosting: Firebase App Hosting (Google Cloud, us-central1)
- Framework: Next.js (App Router) + TypeScript + Tailwind CSS + Firebase

## Working Directory
Always work from the studio folder. This is the only app in this repo.

## Branch Rules
- Deploy branch: main — only merge here when features are ready
- Development: always create a feature branch off main for changes
- Never push directly to main

## App Structure
src/app/dashboard/admin — admin routes
src/app/dashboard/broker — broker dashboard
src/components — shared components
src/firebase — Firebase config
functions/ — Firebase Cloud Functions

## Firebase Project
- Project ID: smart-broker-usa
- Auth domain: smart-broker-usa.firebaseapp.com

## Development Notes
- npm run dev to run locally
- npm run build to verify before merging to main
- Firestore is the primary database
