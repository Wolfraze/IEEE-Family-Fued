# IEEE Family Feud — LAN game

The host and projector display synchronize through a WebSocket served by this
Node.js server. The server is the in-memory source of truth; no cloud service
or internet connection is used for game state.

## Requirements

- Node.js 18 or newer
- Both devices connected to the same reachable local network

## Install and run

1. Install Node.js from [nodejs.org](https://nodejs.org/) if it is not already
   installed.
2. Open a terminal in the project folder and install dependencies:

   ```sh
   npm install
   ```

3. Start the server:

   ```sh
   node server.js
   ```

   For development with Next.js hot reload, use `npm run dev`. For an optimized
   production run, build once with `npm run build`, then use `npm start`.
4. The server binds to `0.0.0.0:3000` and prints the available LAN URLs. The
   home page (`http://localhost:3000`) also discovers and displays the LAN
   address by default, with direct Host and Display links. Select a network
   interface if the computer has more than one. Open the **Host** link on the
   controller device and the **Display** link on the projector device.

The URLs look like:

```text
Display: http://192.168.1.25:3000/display
Host:    http://192.168.1.25:3000/host
```

Use the LAN address shown on the home page (or printed by the server) on both
devices. `localhost` always means the device currently using the browser and
will not reach the host computer from a second device.

## Game and connection behavior

- `/display` is read-only and supports multiple display clients.
- `/host` is the controller. Only one host can control the game at a time; a
  newly connected host takes over, and the previous controller is disconnected.
- `/setup` uses the host role and takes over control while it is connected.
- Game actions and setup changes are validated by the server, then immediately
  broadcast to connected clients.
- Reconnecting clients receive the current full state. The server keeps state
  in memory, so restarting it resets the game to the initial questions/state.
- The host has a **START INTRO** control. It restarts the intro on connected
  display(s) while the game is ready.

## Troubleshooting

- **Firewall prompt:** Allow Node.js to accept private/local network
  connections. If prompted by Windows Defender Firewall or macOS, permit
  incoming connections on the private network. Do not expose port 3000 to
  public networks.
- **Devices cannot connect:** Confirm both devices are on the same Wi-Fi/LAN,
  use the server's printed IPv4 address, and check that TCP port 3000 is not
  blocked.
- **Guest Wi-Fi / campus network isolation:** Guest networks and some college
  access points block device-to-device traffic (AP/client isolation). Try a
  normal private Wi-Fi network or a phone hotspot with both devices connected.
- **Host says another controller is connected:** Close the other `/host` or
  `/setup` tab and wait a moment for its socket to close, then reconnect.
- **Display is offline:** The page reconnects automatically with increasing
  retry delays. Check the server terminal and firewall, then refresh if needed.
- **Find the host page:** Use the Host URL printed by the server on the
  controller device. The LAN sync indicator confirms when it is connected.

## Project layout

- `server.js` — Express HTTP server, Next.js page handler, WebSocket server,
  LAN URL discovery, role lock, in-memory game state, validation, and broadcast.
- `app/display/page.js` — read-only projector UI and intro animation.
- `app/host/page.js` — controller interface and game actions.
- `app/setup/page.js` — question/team setup editor.
- `lib/realtime.js` — client WebSocket connection and exponential reconnect.
- `lib/gameLogicCore.cjs` — shared reducer used by the browser bundle and server.
- `data/questions.json` — default question set.
