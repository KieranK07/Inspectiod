# Inspectiod

Inspectiod is a local web app for capturing and inspecting browser game sessions. It records browser console output, network HAR data, WebSocket frames, loaded JS bundles, DOM snapshots, and optional state dumps, then lets you inspect and chat over captured sessions.

## What you need

- Node.js 20+
- npm 10+
- A desktop environment (Playwright launches Chromium in headed mode)
- `ANTHROPIC_API_KEY` (only required for the Inspector chat feature)

## Quick start

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Install Playwright Chromium (first run only):

   ```bash
   npx playwright install chromium
   ```

3. (Optional) set your Anthropic key for chat:

   ```bash
   export ANTHROPIC_API_KEY="your_key_here"
   ```

4. Start backend + frontend:

   ```bash
   npm run dev
   ```

5. Open `http://127.0.0.1:5173`.

## How to use

1. Go to **Live Capture**.
2. Enter a target URL and optionally a state expression (for example `window.gameState`).
3. Click **Start** and interact with the opened browser window.
4. Click **Stop** when done.
5. Go to **Sessions** and open the session in **Inspector + Chat**.

Captured sessions are stored in `/home/runner/work/Inspectiod/Inspectiod/sessions` by default. You can override this with `SESSIONS_DIR`.

## Scripts

From repo root:

- `npm run dev` – run backend and frontend together
- `npm run dev:backend` – backend only (`127.0.0.1:5174`)
- `npm run dev:frontend` – frontend only (`127.0.0.1:5173`)
- `npm run build` – build backend and frontend

Frontend-only:

- `npm run lint -w frontend`

## Security notes (quick check)

- The API server binds to `127.0.0.1`, so it is only reachable from your local machine by default.
- CORS is permissive (`origin: true`), so keep it local and do not expose the backend port publicly.
- Session capture stores raw traffic and page content; treat session files as sensitive and do not share them unless scrubbed.
- `url` input is validated as an absolute URL and session file reads are path-confined to the selected session directory.

Recommended safe usage:

- Run on a personal machine.
- Capture only sites/data you are authorized to inspect.
- Remove old session folders when no longer needed.

## Troubleshooting

- **`api: unreachable` in UI**: ensure backend is running on port `5174`.
- **Playwright launch errors**: rerun `npx playwright install chromium`.
- **Chat errors**: confirm `ANTHROPIC_API_KEY` is set in the backend environment.
