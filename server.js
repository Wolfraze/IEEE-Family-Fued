const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const express = require("express");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { initialState, reduce } = require("./lib/gameLogicCore.cjs");
const defaultQuestions = require("./data/questions.json");

const port = Number(process.env.PORT || 3000);
const dev = process.argv.includes("--dev") || (!process.argv.includes("--production") && process.env.NODE_ENV !== "production");
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
const gameState = {
  game: { ...initialState(), introId: 0 },
  questions: defaultQuestions,
};
let activeHost = null;
let websocket = null;

function validQuestions(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 100
    && value.every((question) =>
      question && typeof question.question === "string" && question.question.trim() && question.question.length <= 500
      && Array.isArray(question.answers) && question.answers.length > 0 && question.answers.length <= 20
      && question.answers.every((answer) =>
        answer && typeof answer.answer === "string" && answer.answer.trim() && answer.answer.length <= 200
        && Number.isFinite(answer.points) && answer.points >= 0
        && (answer.aliases === undefined || (Array.isArray(answer.aliases) && answer.aliases.length <= 30 && answer.aliases.every((alias) => typeof alias === "string" && alias.length <= 200)))
      )
    );
}

function snapshot() {
  const { game, questions } = gameState;
  const current = questions[game.q] || null;
  const phase = game.phase === "play" ? "round" : game.phase === "final" ? "finished" : game.introId ? "title" : "intro";
  return {
    type: "STATE",
    game,
    questions,
    phase,
    currentQuestion: current ? { index: game.q, question: current.question } : null,
    answers: current ? current.answers.map((answer, index) => ({
      text: answer.answer,
      points: answer.points,
      revealed: Boolean(game.revealed[index]),
    })) : [],
    teamScores: { A: game.scoreA, B: game.scoreB },
    activeTeam: game.turn,
    strikes: game.strikes,
    roundNumber: game.q + 1,
    introId: game.introId || 0,
  };
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast() {
  const state = snapshot();
  for (const client of websocket.clients) {
    if (client.readyState === WebSocket.OPEN) send(client, state);
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
    if (message.key === "feud-questions" && validQuestions(message.value)) {
      const previous = gameState.game;
      gameState.questions = message.value;
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

function printLanUrls() {
  const addresses = getLanAddresses();
  for (const address of addresses) {
    console.log(`Display: http://${address}:${port}/display`);
    console.log(`Host:    http://${address}:${port}/host`);
  }
}

function getLanAddresses() {
  const addresses = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.add(entry.address);
    }
  }
  if (!addresses.size) addresses.add("127.0.0.1");
  return [...addresses];
}

app.prepare().then(() => {
  const expressApp = express();
  expressApp.get("/api/network", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ addresses: getLanAddresses(), port });
  });
  expressApp.use(express.static(path.join(__dirname, "public")));
  expressApp.all("*", (request, response) => handle(request, response));
  const server = http.createServer(expressApp);
  websocket = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/_next/webpack-hmr") {
      app.getUpgradeHandler()(request, socket, head);
      return;
    }
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocket.handleUpgrade(request, socket, head, (client) => {
      const role = url.searchParams.get("role");
      if (!["host", "display"].includes(role)) {
        send(client, { type: "ROLE", accepted: false, message: "Choose host or display role." });
        client.close(1008, "Invalid role");
        return;
      }
      client.role = role;
      if (role === "host") {
        const previousHost = activeHost;
        activeHost = client;
        if (previousHost && previousHost.readyState === WebSocket.OPEN) {
          previousHost.close(4001, "Host controller moved to another device.");
        }
      }
      websocket.emit("connection", client, request);
    });
  });

  websocket.on("connection", (client) => {
    client.isAlive = true;
    client.on("pong", () => { client.isAlive = true; });
    send(client, { type: "ROLE", accepted: true, role: client.role });
    send(client, snapshot());
    client.on("message", (data) => handleMessage(client, client.role, data));
    client.on("close", () => {
      if (activeHost === client) activeHost = null;
      const presence = { type: "PRESENCE", hostConnected: Boolean(activeHost) };
      for (const peer of websocket.clients) send(peer, presence);
    });
  });

  websocket.on("connection", (client) => {
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
    printLanUrls();
  });
}).catch((error) => {
  console.error("Failed to start IEEE Family Feud server:", error);
  process.exitCode = 1;
});
