"use client";
import { useEffect, useState } from "react";
import defaults from "../data/questions.json";
import { connectRealtime, connectionRole, sendRealtime, subscribeRealtimeStatus } from "./realtime";

export const KEYS = { game: "feud-game", q: "feud-questions" };
export const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

export const write = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("feud-local-update", { detail: { key: k, value: v } }));
  return sendRealtime({ type: "SETUP", key: k, value: v });
};
export const getQuestions = () => read(KEYS.q, defaults);

export function useLocal(k, fb) {
  const [v, setV] = useState(fb);
  useEffect(() => {
    const load = () => setV(read(k, fb));
    const receiveSnapshot = (event) => {
      const value = event.detail?.[k === KEYS.game ? "game" : "questions"];
      if (value !== undefined) setV(value);
    };
    const receiveLocalUpdate = (event) => {
      if (event.detail?.key === k) setV(event.detail.value);
    };
    load();
    const h = (e) => { if (e.key === k || e.key === null) load(); };
    window.addEventListener("storage", h);
    window.addEventListener("feud-state-update", receiveSnapshot);
    window.addEventListener("feud-local-update", receiveLocalUpdate);
    const disconnect = connectRealtime(connectionRole());
    return () => {
      window.removeEventListener("storage", h);
      window.removeEventListener("feud-state-update", receiveSnapshot);
      window.removeEventListener("feud-local-update", receiveLocalUpdate);
      disconnect();
    };
  }, [k]);
  return [v, setV];
}

export function useSyncStatus() {
  const [sync, setSync] = useState({ status: "syncing", message: "" });
  useEffect(() => {
    const update = (event) => setSync(event.detail);
    window.addEventListener("feud-sync-status", update);
    const unsubscribe = subscribeRealtimeStatus((status, message) => setSync({ status, message }));
    const disconnect = connectRealtime(connectionRole());
    return () => {
      window.removeEventListener("feud-sync-status", update);
      unsubscribe();
      disconnect();
    };
  }, []);
  return sync;
}
