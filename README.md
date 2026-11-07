# APE UI

React and TypeScript frontend workspace for the Automated English Pronunciation Evaluator. It uses Vite for development and builds and React Router for client-side routes.

## Requirements

- Node.js 22.22 or newer
- Bun 1.3.5 or newer

## Local development

Start the backend from the main APE repository, then run the UI:

```bash
cp .env.example .env.local
bun install --frozen-lockfile
bun run dev
```

Vite serves the UI at `http://localhost:5173` and proxies `/api`, `/health`, `/public`, `/ready`, and `/v1` requests to `http://127.0.0.1:3000`. Set `API_PROXY_TARGET` in `.env.local` if the backend uses another address.

For a separately hosted API, set `VITE_API_BASE_URL` to its origin. The backend must allow the UI origin in `PUBLIC_BASE_URL` for browser requests across origins. Leave the value empty to use same-origin paths.

## Deploying to Vercel

Set the project root to `ui`, the build command to `bun run build`, and the output directory to `dist`. Set `VITE_API_BASE_URL` to the public backend origin at build time. `vercel.json` rewrites frontend routes to `index.html`, allowing assessment links and other client-side routes to work on direct visits and refreshes. If the backend is proxied through the same domain, configure its rewrites before the SPA catch-all.

## Admin result details

On `/admin/assessments`, completed submissions have **PDF** (download), **View PDF** (open online in a new tab), and **Details** buttons. The PDF viewer uses the authenticated report API without putting access tokens in the URL. Allow pop-ups for the site if the browser blocks the preview tab. Preview blob URLs belong to the new tab and are released when it closes or navigates away. **Details** opens a full-screen table of persisted detector errors, with filters for each reading and **Load more errors** pagination. The view uses the same center login and refresh flow as PDF downloads, via `GET /assessments/{id}/results`.

The table shows check, target example/location, expected/observed details when recorded, and the detector reason. Missing historical evidence and unscored report items are identified explicitly. Raw provider data and numeric scores are not displayed. Closing the modal or changing reading filters cancels the pending request.

## OpenAPI types

`assets/open-api.json` is the OpenAPI 3.1 document used to generate frontend types in `src/api-schema.d.ts`. Refresh the JSON from the running backend when its API contract changes, then regenerate the types:

```bash
curl --fail http://127.0.0.1:3000/api-docs/openapi.json -o assets/open-api.json
bun run api:types
```

The production build checks that the generated types match the JSON snapshot.

## Commands

```bash
bun run dev       # Start the Vite development server
bun run build     # Type check and create the production bundle in dist/
bun run preview   # Preview the production bundle locally
bun run lint      # Lint with Oxlint
bun run api:types # Regenerate types from assets/open-api.json
```
