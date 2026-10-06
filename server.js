require("dotenv").config();

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const express = require("express");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { initialState, reduce } = require("./lib/gameLogicCore.cjs");
const { validQuestions } = require("./lib/questionValidation.cjs");
const defaultQuestions = require("./data/questions.json");

const port = Number(process.env.PORT || 3000);
const dev = process.argv.includes("--dev") || (!process.argv.includes("--production") && process.env.NODE_ENV !== "production");
const hostCode = process.env.HOST_CODE;
const stateFile = path.resolve(process.env.STATE_FILE || path.join(__dirname, "state.json"));
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
const roomCodeAttempts = new Map();
const CODE_WINDOW_MS = 15 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

if (!dev && !hostCode) throw new Error("HOST_CODE must be set before starting in production.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
const gameState = {
  game: { ...initialState(), introId: 0 },
  questions: defaultQuestions,
};
let activeHost = null;
let websocket = null;
let persistTimer = null;
let persistence = Promise.resolve();
let persistenceSequence = 0;

function loadState() {
  if (!fs.existsSync(stateFile)) return;
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (!saved || typeof saved !== "object" || !saved.game || !validQuestions(saved.questions)) {
    throw new Error(`Persisted game state at ${stateFile} is invalid.`);
  }
  Object.assign(gameState, { game: { ...initialState(), ...saved.game }, questions: saved.questions });
}

function persistSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    let temporary;
    persistence = persistence.then(async () => {
      temporary = `${stateFile}.${process.pid}.${++persistenceSequence}.tmp`;
      await fs.promises.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.promises.writeFile(temporary, JSON.stringify({ game: gameState.game, questions: gameState.questions }, null, 2));
      await fs.promises.rename(temporary, stateFile);
    }).catch((error) => {
      console.error("Could not persist game state atomically:", error);
      if (temporary) {
        fs.promises.rm(temporary, { force: true }).catch((cleanupError) => {
          console.error("Could not remove temporary game state:", cleanupError);
        });
      }
    });
  }, 200);
}

function snapshot(role = "host") {
  const { game, questions } = gameState;
  const current = questions[game.q] || null;
  const phase = game.phase === "play" ? "round" : game.phase === "final" ? "finished" : game.introId ? "title" : "intro";
  const common = {
    type: "STATE",
    game,
    phase,
    currentQuestion: current ? { index: game.q, question: current.question } : null,
    answers: current ? current.answers.map((answer, index) => game.revealed[index]
      ? { revealed: true, text: answer.answer, points: answer.points * (current.multiplier || 1) }
      : { revealed: false }) : [],
    answerCount: current ? current.answers.length : 0,
    multiplier: current ? current.multiplier || 1 : 1,
    teamScores: { A: game.scoreA, B: game.scoreB },
    activeTeam: game.turn,
    strikes: game.strikes,
    roundNumber: game.q + 1,
    introId: game.introId || 0,
  };
  return role === "host" ? { ...common, questions } : common;
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast() {
  persistSoon();
  for (const client of websocket.clients) {
    if (client.readyState === WebSocket.OPEN && client.authenticated) send(client, snapshot(client.role));
  }
}

function sendError(socket, message) {
  send(socket, { type: "ERROR", message });
}

function applyAction(action) {
  const allowed = new Set([
    "SELECT", "GUESS", "REVEAL", "AWARD_ANSWER", "STRIKE", "UNSTRIKE",
    "STEAL", "SWITCH", "ADJ", "AWARD", "RESET_ROUND", "NEXT", "NEXT_ROUND", "PREV",
    "END", "UNDO", "UNDO_LAST_AWARD", "RESTART",
  ]);
  if (!action || typeof action !== "object" || !allowed.has(action.type)) return "Unsupported host action.";
  const question = gameState.questions[gameState.game.q];
  if (action.type === "STRIKE" && gameState.game.phase !== "play") return "The buzzer is only available during a round.";
  if (action.type === "SELECT" && (!Number.isInteger(action.i) || action.i < 0 || action.i >= gameState.questions.length)) {
    return "Select a valid question.";
  }
  if (action.type === "REVEAL" && (!question || !Number.isInteger(action.i) || action.i < 0 || action.i >= question.answers.length)) {
    return "Select a valid answer to reveal.";
  }
  if (action.type === "AWARD_ANSWER" && (!Number.isInteger(action.i) || !["A", "B"].includes(action.t))) {
    return "Invalid answer award.";
  }
  if (["AWARD", "ADJ"].includes(action.type) && !["A", "B"].includes(action.t)) return "Select a valid team.";
  if (action.type === "ADJ" && (!Number.isFinite(action.d) || Math.abs(action.d) > 100000)) return "Invalid score adjustment.";
  if (action.type === "GUESS" && (typeof action.text !== "string" || action.text.length > 300)) return "Invalid guess.";

  const normalizedAction = action.type === "NEXT_ROUND" ? { ...action, type: "NEXT" } : action;
  gameState.game = reduce(gameState.game, normalizedAction, gameState.questions);
  return null;
}

function handleMessage(socket, role, data) {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    sendError(socket, "Message must be valid JSON.");
    return;
  }
  if (!message || typeof message !== "object") {
    sendError(socket, "Invalid message.");
    return;
  }
  if (role !== "host") {
    sendError(socket, "Display connections are read-only.");
    return;
  }
  if (socket !== activeHost) {
    sendError(socket, "This host has been replaced by a newer controller.");
    return;
  }

  if (message.type === "ACTION") {
    const error = applyAction(message.action);
    if (error) return sendError(socket, error);
    broadcast();
    return;
  }

  if (message.type === "START_INTRO") {
    if (gameState.game.phase !== "ready") return sendError(socket, "The intro can only start while the game is ready.");
    gameState.game = { ...gameState.game, introId: (gameState.game.introId || 0) + 1 };
    broadcast();
    return;
  }

  if (message.type === "SETUP") {
    if (message.key === "reset-questions" || (message.key === "feud-questions" && validQuestions(message.value))) {
      const previous = gameState.game;
      gameState.questions = message.key === "reset-questions" ? defaultQuestions : message.value;
      if (previous.q >= gameState.questions.length) {
        gameState.game = {
          ...initialState(),
          teamA: previous.teamA,
          teamB: previous.teamB,
          scoreA: previous.scoreA,
          scoreB: previous.scoreB,
          introId: previous.introId || 0,
        };
      } else if (previous.q >= 0 && previous.phase === "play") {
        gameState.game = reduce(previous, { type: "RESET_ROUND" }, gameState.questions);
      }
      broadcast();
      return;
    }
    if (message.key === "feud-game" && message.value && typeof message.value === "object") {
      const { teamA, teamB } = message.value;
      if (typeof teamA !== "string" || typeof teamB !== "string" || teamA.length > 40 || teamB.length > 40) {
        return sendError(socket, "Team names must be text with at most 40 characters.");
      }
      gameState.game = { ...gameState.game, teamA: teamA.trim() || "TEAM A", teamB: teamB.trim() || "TEAM B" };
      broadcast();
      return;
    }
    return sendError(socket, "Invalid setup update.");
  }

  sendError(socket, "Unsupported message type.");
}

function requestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const address = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.socket.remoteAddress;
  return (address || "unknown").replace(/^::ffff:/, "");
}

function roomCodeMatches(candidate) {
  if (typeof candidate !== "string" || !hostCode) return false;
  const expectedHash = crypto.createHash("sha256").update(hostCode.toUpperCase()).digest();
  const candidateHash = crypto.createHash("sha256").update(candidate.toUpperCase()).digest();
  return crypto.timingSafeEqual(expectedHash, candidateHash);
}

function rejectHost(client, message) {
  send(client, { type: "ROLE", accepted: false, message });
  client.close(1008, message.slice(0, 120));
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return dev;
  if (allowedOrigins.has(origin)) return true;
  const protocol = request.headers["x-forwarded-proto"]?.split(",")[0].trim() || (request.socket.encrypted ? "https" : "http");
  const host = request.headers["x-forwarded-host"]?.split(",")[0].trim() || request.headers.host;
  return origin === `${protocol}://${host}`;
}

function failedAuthMessage(request, message) {
  const now = Date.now();
  const ip = requestIp(request);
  for (const [address, entry] of roomCodeAttempts) {
    if (now - entry.since >= CODE_WINDOW_MS) roomCodeAttempts.delete(address);
  }
  const attempts = roomCodeAttempts.get(ip) || { count: 0, since: now };
  if (now - attempts.since >= CODE_WINDOW_MS) {
    attempts.count = 0;
    attempts.since = now;
  }
  if (attempts.count >= CODE_MAX_ATTEMPTS) {
    return "Too many incorrect room-code attempts. Try again in 15 minutes.";
  }
  attempts.count += 1;
  roomCodeAttempts.set(ip, attempts);
  return attempts.count >= CODE_MAX_ATTEMPTS
    ? "Too many incorrect room-code attempts. Try again in 15 minutes."
    : message;
}

function authenticateHost(client, request, message) {
  const ip = requestIp(request);
  const attempts = roomCodeAttempts.get(ip);
  if (attempts && Date.now() - attempts.since < CODE_WINDOW_MS && attempts.count >= CODE_MAX_ATTEMPTS) {
    rejectHost(client, "Too many incorrect room-code attempts. Try again in 15 minutes.");
    return;
  }
  if (!roomCodeMatches(message.code)) {
    rejectHost(client, failedAuthMessage(request, "Incorrect room code."));
    return;
  }
  roomCodeAttempts.delete(ip);
  clearTimeout(client.authTimer);
  client.authenticated = true;
  const previousHost = activeHost;
  activeHost = client;
  if (previousHost && previousHost !== client && previousHost.readyState === WebSocket.OPEN) {
    previousHost.close(4001, "Host controller moved to another device.");
  }
  send(client, { type: "ROLE", accepted: true, role: "host" });
  send(client, snapshot("host"));
  const presence = { type: "PRESENCE", hostConnected: true };
  for (const peer of websocket.clients) if (peer.authenticated) send(peer, presence);
}

function start() {
  loadState();
  return app.prepare().then(() => {
    const expressApp = express();
    expressApp.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
    expressApp.get("/api/connection", (request, response) => {
      const forwardedHost = request.headers["x-forwarded-host"]?.split(",")[0].trim();
      const forwardedProtocol = request.headers["x-forwarded-proto"]?.split(",")[0].trim();
      const requestHost = forwardedHost || request.headers.host || "localhost";
      const protocol = forwardedProtocol || (request.socket.encrypted ? "https" : "http");
      const remoteAddress = (request.socket.remoteAddress || "").replace(/^::ffff:/, "");
      const loopbackRequest = remoteAddress === "127.0.0.1" || remoteAddress === "::1";
      const localHostRequest = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(requestHost);
      const requestPort = requestHost.match(/:\d+$/)?.[0] || "";
      let hostUrls = [];
      if (loopbackRequest && localHostRequest) {
        for (const [interfaceName, interfaces] of Object.entries(os.networkInterfaces())) {
          for (const entry of interfaces || []) {
            if (entry.family === "IPv4" && !entry.internal) {
              hostUrls.push({
                address: entry.address,
                label: interfaceName,
                hostUrl: `${protocol}://${entry.address}${requestPort}/host`,
              });
            }
          }
        }
      }
      hostUrls.sort((left, right) => {
        const wifiRank = (label) => /wi-?fi|wireless/i.test(label) ? 0 : 1;
        const rank = (address) => address.startsWith("192.168.") ? 0
          : address.startsWith("10.") ? 1
            : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3;
        return wifiRank(left.label) - wifiRank(right.label) || rank(left.address) - rank(right.address);
      });
      const connectHost = hostUrls[0]?.hostUrl || `${protocol}://${requestHost}/host`;
      response.set("Cache-Control", "no-store");
      response.json({ hostUrl: connectHost, hostUrls });
    });
    expressApp.use(express.static(path.join(__dirname, "public")));
    expressApp.all("*", (request, response) => handle(request, response));
    const server = http.createServer(expressApp);
    websocket = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === "/_next/webpack-hmr" && dev) {
        app.getUpgradeHandler()(request, socket, head);
        return;
      }
      if (url.pathname !== "/ws" || !originAllowed(request)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      websocket.handleUpgrade(request, socket, head, (client) => {
        const role = url.searchParams.get("role");
        if (!["host", "display"].includes(role)) {
          rejectHost(client, "Choose host or display role.");
          return;
        }
        client.role = role;
        websocket.emit("connection", client, request);
      });
    });

    websocket.on("connection", (client, request) => {
      client.isAlive = true;
      client.on("pong", () => { client.isAlive = true; });
      client.on("message", (data) => {
        if (client.role === "host" && !client.authenticated) {
          let auth;
          try { auth = JSON.parse(data.toString()); } catch { return rejectHost(client, failedAuthMessage(request, "Send a valid room code to continue.")); }
          if (!auth || auth.type !== "AUTH") return rejectHost(client, failedAuthMessage(request, "Host room code is required."));
          authenticateHost(client, request, auth);
          return;
        }
        handleMessage(client, client.role, data);
      });
      client.on("close", () => {
        if (activeHost === client) activeHost = null;
        const presence = { type: "PRESENCE", hostConnected: Boolean(activeHost) };
        for (const peer of websocket.clients) if (peer.authenticated) send(peer, presence);
      });
      if (client.role === "host") {
        client.authTimer = setTimeout(() => {
          if (!client.authenticated && client.readyState === WebSocket.OPEN) {
            rejectHost(client, failedAuthMessage(request, "Host authentication timed out."));
          }
        }, 5000);
        client.once("close", () => clearTimeout(client.authTimer));
      } else {
        client.authenticated = true;
        send(client, { type: "ROLE", accepted: true, role: "display" });
        send(client, snapshot("display"));
      }
      send(client, { type: "PRESENCE", hostConnected: Boolean(activeHost) });
    });

    const heartbeat = setInterval(() => {
      for (const client of websocket.clients) {
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 30000);
    server.on("close", () => clearInterval(heartbeat));

    server.listen(port, "0.0.0.0", () => {
      console.log(`IEEE Family Feud listening on 0.0.0.0:${port}${dev ? " (development)" : ""}`);
    });
  });
}

start().catch((error) => {
  console.error("Failed to start IEEE Family Feud server:", error);
  process.exitCode = 1;
});
