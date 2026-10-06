"use client";

let socket = null;
let socketRole = null;
let retryTimer = null;
let retryDelay = 500;
let status = "syncing";
let reconnectMessage = "";
let roleAccepted = false;
let consumers = 0;
const statusListeners = new Set();

function report(statusValue, message = "") {
  status = statusValue;
  reconnectMessage = message;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("feud-sync-status", {
      detail: { status: statusValue, message },
    }));
  }
  for (const listener of statusListeners) listener(statusValue, message);
}

function applySnapshot(snapshot) {
  if (!snapshot || snapshot.type !== "STATE") return;
  try {
    localStorage.setItem("feud-game", JSON.stringify(snapshot.game));
    localStorage.setItem("feud-questions", JSON.stringify(snapshot.questions));
  } catch (error) {
    report("offline", `Could not cache game state: ${error.message}`);
  }
  window.dispatchEvent(new CustomEvent("feud-state-update", { detail: snapshot }));
}

function scheduleReconnect(role) {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    openConnection(role);
  }, retryDelay);
  retryDelay = Math.min(10000, retryDelay * 2);
}

function openConnection(role) {
  if (socket && socketRole === role && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  socketRole = role;
  roleAccepted = false;
  window.clearTimeout(retryTimer);
  retryTimer = null;
  report("syncing");

  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const connection = new WebSocket(`${scheme}//${window.location.host}/ws?role=${encodeURIComponent(role)}`);
  socket = connection;

  connection.addEventListener("open", () => {
    if (socket !== connection) return;
    report("syncing");
  });
  connection.addEventListener("message", (event) => {
    if (socket !== connection) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      report("offline", `Received invalid server data: ${error.message}`);
      return;
    }
    if (message.type === "ROLE") {
      if (!message.accepted) report("offline", message.message || "This connection cannot control the game.");
      else {
        roleAccepted = true;
        retryDelay = 500;
        report("online");
      }
    } else if (message.type === "STATE") {
      applySnapshot(message);
      report("online");
    } else if (message.type === "PRESENCE") {
      window.dispatchEvent(new CustomEvent("feud-presence", { detail: message }));
    } else if (message.type === "ERROR") {
      report("online", message.message || "The server rejected the request.");
    }
  });
  connection.addEventListener("close", (event) => {
    if (socket !== connection) return;
    socket = null;
    roleAccepted = false;
    if (event.code === 4001) {
      report("offline", event.reason || "This host was replaced by another controller.");
      return;
    }
    report("offline", event.code === 1008 ? event.reason || "Host role is unavailable." : "Reconnecting to the game server…");
    scheduleReconnect(role);
  });
  connection.addEventListener("error", () => {
    if (socket === connection) report("offline", "Connection to the game server failed.");
  });
}

export function connectRealtime(role) {
  if (typeof window === "undefined") return () => {};
  consumers += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    consumers = Math.max(0, consumers - 1);
    if (consumers !== 0) return;
    window.clearTimeout(retryTimer);
    retryTimer = null;
    const active = socket;
    socket = null;
    socketRole = null;
    roleAccepted = false;
    if (active && active.readyState < WebSocket.CLOSING) active.close();
  };

  if (!socket || socketRole !== role || (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING)) {
    openConnection(role);
  }
  return release;
}

export function sendRealtime(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !roleAccepted) {
    report("offline", "Not connected. The server will send current game state when reconnected.");
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

export function subscribeRealtimeStatus(listener) {
  statusListeners.add(listener);
  listener(status, reconnectMessage);
  return () => statusListeners.delete(listener);
}

export function connectionRole() {
  return window.location.pathname.startsWith("/host") || window.location.pathname.startsWith("/setup")
    ? "host"
    : "display";
}
