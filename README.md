# IEEE Family Feud

A single Node.js web service runs the Next.js app, Express server, and WebSocket
game state. Open the host controller on a phone or laptop and the display on a
projector; both connect to the same public service.

## Requirements

- Node.js 18 or newer
- A private `HOST_CODE` for controlling the game

## Run locally

```sh
npm install
```

Copy `.env.example` to `.env`, set a private `HOST_CODE`, then start the service:

```sh
npm run dev
```

Open `http://localhost:3000`. The home page links to the host and display and
creates a QR code locally in the browser for the host URL. For a production
build, run `npm run build` followed by `npm start`; production startup requires
`HOST_CODE`.

The development server allows the machine's active IPv4 interface addresses as
Next.js dev origins, so other devices on the same network can load the app
without cross-origin warnings.

## Deploy to Render

**Security status:** the requested latest Next.js 14.2 patch (`14.2.35`) still
has upstream advisories reported by `npm audit` (one critical Next.js finding
and one high PostCSS finding). `npm audit fix` cannot resolve them without
moving beyond the requested Next.js 14.2 line; npm only offers Next.js 16.3.8
as an audit fix, which is a major-version upgrade. Keep this service private
until you decide whether to accept that major upgrade or knowingly deploy with
the reported risks.

1. Push this repository to GitHub and create a Render **Web Service** from it
   (or use the included `render.yaml` Blueprint).
2. Use the configured build command `npm install && npm run build`, start
   command `npm start`, and health check path `/health`.
3. In the service environment, set `HOST_CODE` to a private room code. Never
   put it in source control or print it on a public landing page.
4. Set `ALLOWED_ORIGINS` to the service's exact public origin, for example
   `https://ieee-family-feud.onrender.com`. For multiple trusted origins,
   separate the origins with commas; do not include URL paths.
5. Deploy. Share the service root URL or its host QR code with the controller;
   open **OPEN PROJECTOR DISPLAY** on the projector. The host enters the
   private room code on `/host`; it is stored only in that browser tab session.
6. `PORT` is supplied by Render automatically. The included `STATE_FILE`
   setting writes `state.json` under the service directory.

The game state is debounced to an atomic `{ game, questions }` JSON file and
restored when the service starts. **Render's free tier has an ephemeral disk
and sleeps when idle**, so state can be lost during restarts/redeploys and the
first request may be slow. For event safety, use a paid always-on instance and
attach a persistent disk mounted at `/var/data`, then set `STATE_FILE` to
`/var/data/state.json`. Confirm the disk is mounted and writable before the
event.

## Runtime and game behavior

- `GET /health` returns HTTP 200 when the web service is ready.
- `/display` is read-only and receives a redacted snapshot: unrevealed answer
  text and aliases are never sent to display WebSocket clients.
- `/host` and `/setup` require the private room code. The room code is the
  host credential, not just a room locator: share it only with trusted
  controllers. Only an authenticated host can take over the controller role;
  five invalid attempts per IP are allowed in a 15-minute window.
- The home page's QR opens `/host` directly. Locally, scanning from a page
  opened on `localhost` points to the laptop's LAN address; on deployment it
  points to the public service address. The QR never contains the room code.
- `ALLOWED_ORIGINS` is an optional comma-separated allowlist for WebSocket
  origins. The service also accepts same-origin WebSocket connections and
  rejects other origins.
- Setup supports a guided question/answer form and an advanced JSON editor.
  Each question may use a ×1, ×2, or ×3 multiplier; omitted multipliers default
  to ×1.
- Display sound is generated with Web Audio after the operator selects
  **Enable sound**. Sound and mute controls are only shown on `/display`.
- Question order is saved in browser local storage under `feud_queue_v1`.
  Each round has an independently shuffled unseen queue; shown questions stay
  behind unseen questions in least-recently-shown order across game restarts.
  In development, run `window.resetFeudQuestionHistory()` in the browser
  console to clear history for testing.
- State lives in memory while running and is persisted to `STATE_FILE` after
  changes. Store that file on a persistent disk for durability across service
  restarts.

## Local fallback and pre-event checklist

1. Set a private `HOST_CODE` and start the app on a laptop with `npm start` after
   building (or `npm run dev` for a quick fallback).
2. Connect the laptop and controller phone to a phone hotspot. Open the laptop's
   LAN host URL on the phone and its display URL on the projector/browser.
3. Test host controls on mobile data and verify the deployed room code works.
4. Enable display sound on the projector device if desired.
5. Put the projector display in full-screen mode (press **F** or double-click).
6. Wake the hosted service at least **10 minutes before** the event, verify
   `/health`, connect host and display, and test a reveal, strike, and award.
7. Keep the local laptop/hotspot setup ready as the fallback if the public
   service or venue network becomes unavailable.

## Project layout

- `server.js` — Express/Next HTTP server, WebSocket auth/roles, redacted
  snapshots, validation, health check, and state persistence.
- `app/display/page.js` — projector UI, snapshot-driven answer board, intro,
  event overlays, and generated sound.
- `app/host/page.js` — authenticated controller UI and game actions.
- `app/setup/page.js` — authenticated team/question form and JSON editor.
- `public/ieee-logo.png` — IEEE SIES GST Student Branch logo used across the
  app outside the intro animation.
- `lib/questionQueue.cjs` — persistent per-round shuffled question history.
- `test/questionQueue.test.cjs` — question-cycle, reset, and storage edge-case tests.
- `lib/realtime.js` — WebSocket connection, room-code exchange, and reconnect logic.
- `lib/gameLogicCore.cjs` — shared reducer used by the browser bundle and server.
- `lib/questionValidation.cjs` — shared setup validation rules.
- `data/questions.json` — the 50-question set supplied for the event.
