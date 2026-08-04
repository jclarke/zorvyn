# Zorvyn

Independent mobile + web client for cloud coding-agent workspaces. Vibe code from your phone or browser.

**Not affiliated with Conductor or any agent platform.**

## Stack

- Expo SDK 57 · React Native · React 19
- expo-router, SecureStore (native) / localStorage (web)
- Optional GitHub PAT for PR file diffs

## Get started

```bash
npm install
npx expo start
```

## Web / Vercel

```bash
npm run build          # expo export --platform web → dist/
# or
vercel --prod
```

`vercel.json` builds with Expo web export and serves the SPA from `dist/`.

## Setup

1. Create an API key from your cloud agent platform
2. Open Zorvyn and paste it on the sign-in screen
3. Key is stored on-device; you stay signed in across launches
