"use client";
import { useEffect, useState } from "react";
import defaults from "../../data/questions.json";
import { KEYS, read, write, useSyncStatus } from "../../lib/storage";
import { initialState } from "../../lib/gameLogic";

export default function Setup() {
  const [a, setA] = useState(""), [b, setB] = useState(""), [text, setText] = useState(""), [msg, setMsg] = useState("");
  const { status: syncStatus, message: syncMessage } = useSyncStatus();
  useEffect(() => {
    const hydrate = (game, questions) => {
      setA(game.teamA);
      setB(game.teamB);
      setText(JSON.stringify(questions, null, 2));
    };
    hydrate(read(KEYS.game, initialState()), read(KEYS.q, defaults));
    const receive = (event) => hydrate(event.detail.game, event.detail.questions);
    window.addEventListener("feud-state-update", receive);
    return () => window.removeEventListener("feud-state-update", receive);
  }, []);

  const save = () => {
    try {
      const qs = JSON.parse(text);
      if (!Array.isArray(qs) || !qs.length) throw new Error("Need a non-empty list of questions.");
      qs.forEach((q, i) => {
        if (!q.question || !Array.isArray(q.answers) || !q.answers.length) throw new Error(`Question ${i + 1}: needs "question" and "answers".`);
        q.answers.forEach((x, j) => { if (!x.answer || typeof x.points !== "number") throw new Error(`Question ${i + 1}, answer ${j + 1}: needs "answer" and numeric "points".`); });
      });
      const questionsSent = write(KEYS.q, qs);
      const teamsSent = write(KEYS.game, { ...read(KEYS.game, initialState()), teamA: a || "TEAM A", teamB: b || "TEAM B" });
      setMsg(questionsSent && teamsSent
        ? "Saved to the game server. Use “Restart entire game” on the host page if a game is in progress."
        : "Saved on this device only; reconnect as the host and save again to sync.");
    } catch (e) { setMsg("Not saved: " + e.message); }
  };
  const restore = () => {
    const sent = write(KEYS.q, defaults);
    setText(JSON.stringify(defaults, null, 2));
    setMsg(sent ? "Default questions restored on the game server." : "Defaults restored on this device only; reconnect as the host and restore again to sync.");
  };

  return (
    <div className="host setup">
      <header><h1>IEEE FAMILY FEUD <small>Setup</small></h1><span className={"network-status " + syncStatus} title={syncMessage}>{syncStatus === "online" ? "LAN SYNC · LIVE" : syncStatus === "offline" ? "LAN SYNC · OFFLINE" : "CONNECTING…"}</span><a href="/host">Go to host</a></header>
      <section className="row"><input value={a} onChange={(e) => setA(e.target.value)} placeholder="Team A name" /><input value={b} onChange={(e) => setB(e.target.value)} placeholder="Team B name" /></section>
      <p>Edit questions below. Order of answers = rank order (first is #1). Add as many aliases as you like. Question order is play order.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <section className="row"><button className="go big" onClick={save}>Save setup</button><button onClick={restore}>Restore default questions</button><span>{msg}</span></section>
    </div>
  );
}
