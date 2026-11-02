# APE UI

React and TypeScript frontend workspace for the Automated English Pronunciation Evaluator. It uses Vite for development and builds and React Router for client-side routes.

## Requirements

- Node.js 22.22 or newer
- npm

## Local development

Start the backend from the main APE repository, then run the UI:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Vite serves the UI at `http://localhost:5173` and proxies `/api`, `/health`, `/public`, `/ready`, and `/v1` requests to `http://127.0.0.1:3000`. Set `API_PROXY_TARGET` in `.env.local` if the backend uses another address.

For a separately hosted API, set `VITE_API_BASE_URL` to its origin. The backend must allow the UI origin in `PUBLIC_BASE_URL` for browser requests across origins. Leave the value empty to use same-origin paths.

## Commands

```bash
npm run dev       # Start the Vite development server
npm run build     # Type check and create the production bundle in dist/
npm run preview   # Preview the production bundle locally
npm run lint      # Lint with Oxlint
```
