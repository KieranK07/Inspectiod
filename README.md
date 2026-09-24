# Inspectiod

Inspectiod is a local-first web application for capturing and inspecting browser game sessions.  
It collects console logs, HAR traffic, WebSocket frames, loaded bundles, DOM snapshots, and optional state dumps, then provides an inspector + chat workflow for analysis.

## Project status

- Active development
- Local-only by default (`127.0.0.1`)

## Requirements

- Node.js 20+
- npm 10+
- Google Chrome installed (captures run in a headed Chrome window via Playwright's `chrome` channel)
- Desktop environment
- `ANTHROPIC_API_KEY` (optional; required only for Inspector chat)

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional: enable chat:
   ```bash
   export ANTHROPIC_API_KEY="your_key_here"
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open `http://127.0.0.1:5173`.

## Usage flow

1. Open **Live Capture**.
2. Enter a target URL and optional state expression (for example: `window.gameState`).
3. Click **Start** and interact with the opened browser.
4. Click **Stop** when finished.
5. Open the session from **Sessions** in **Inspector + Chat**.

Captured sessions are stored in `./sessions` by default. Override with `SESSIONS_DIR` when needed.

## Scripts

From the repository root:

- `npm run dev` — run backend and frontend together
- `npm run dev:backend` — backend only (`127.0.0.1:5174`)
- `npm run dev:frontend` — frontend only (`127.0.0.1:5173`)
- `npm run build` — build backend and frontend
- `npm run lint -w frontend` — lint frontend workspace

## Security notes

- API server is bound to `127.0.0.1` by default (local machine only).
- CORS is permissive (`origin: true`), so do not expose backend publicly.
- Session artifacts may include sensitive page/traffic data; treat captures as sensitive.
- Session file access is path-confined to the selected session directory.

Recommended practice:

- Run on a personal machine.
- Capture only data you are authorized to inspect.
- Remove stale session folders periodically.

## Troubleshooting

- **`api: unreachable` in UI**: verify backend is running on `5174`.
- **Playwright launch errors**: install Google Chrome, or run `npx playwright install chrome`.
- **Chat errors**: confirm `ANTHROPIC_API_KEY` is set for backend runtime.
