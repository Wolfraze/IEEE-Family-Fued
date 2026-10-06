"use client";
import { useEffect, useRef, useState } from "react";
import { KEYS, getQuestions, useLocal, useSyncStatus } from "../../lib/storage";
import { sendRealtime } from "../../lib/realtime";
import { initialState } from "../../lib/gameLogic";

export default function Host() {
  const [g] = useLocal(KEYS.game, initialState());
  const [qs] = useLocal(KEYS.q, getQuestions());
  const [guess, setGuess] = useState("");
  const [awardConfirmation, setAwardConfirmation] = useState(null);
  const { status: syncStatus, message: syncMessage } = useSyncStatus();
  const input = useRef(null);
  useEffect(() => {
    if (!awardConfirmation) return;
    const timer = setTimeout(() => setAwardConfirmation(null), 1100);
    return () => clearTimeout(timer);
  }, [awardConfirmation]);

  const go = (action) => sendRealtime({ type: "ACTION", action });
  const submit = () => { if (guess.trim() && go({ type: "GUESS", text: guess })) { setGuess(""); input.current?.focus(); } };

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (e.key === " ") { e.preventDefault(); guess.trim() ? submit() : input.current?.focus(); }
      else if (k === "r") { const i = g.revealed.findIndex((x) => !x); if (i >= 0) go({ type: "REVEAL", i }); }
      else if (k === "s") go({ type: "STRIKE" });
      else if (k === "n") go({ type: "NEXT" });
      else if (k === "u") go({ type: "UNDO" });
      else if (k === "f") window.open("/display", "feud-display");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const q = qs[g.q];
  const name = (t) => (t === "A" ? g.teamA : g.teamB);
  const pendingAwardIndex = q?.answers.findIndex((_, i) => g.revealed[i] && !g.awarded?.[i]) ?? -1;
  const awardTo = (t) => {
    if (pendingAwardIndex < 0 || !q) return;
    const answer = q.answers[pendingAwardIndex];
    if (go({ type: "AWARD_ANSWER", i: pendingAwardIndex, t })) {
      setAwardConfirmation({ team: t, points: answer.points, answer: answer.answer });
    }
  };
  return (
    <main className="host host-console">
      <header className="console-header">
        <a className="console-brand" href="/"><span className="brand-emblem">IEEE</span><span><strong>IEEE FAMILY FEUD</strong><small>LIVE HOST CONSOLE</small></span></a>
        <div className="console-links"><span className={"network-status " + syncStatus} role="status" title={syncMessage}>{syncStatus === "online" ? "LAN SYNC · LIVE" : syncStatus === "offline" ? "LAN SYNC · OFFLINE" : "CONNECTING…"}</span>{syncMessage && <span className="sync-feedback" role="alert">{syncMessage}</span>}<button disabled={g.phase !== "ready"} onClick={() => sendRealtime({ type: "START_INTRO" })}>START INTRO</button><button onClick={() => window.open("/display", "feud-display")}>OPEN PROJECTOR <kbd>F</kbd></button><a href="/setup">SETUP</a></div>
      </header>

      <section className="console-panel current-panel">
        <div className="section-heading"><div><span className="eyebrow">ROUND {g.q >= 0 ? String(g.q + 1).padStart(2, "0") : "--"}</span><h2>CURRENT QUESTION</h2></div><span className={"status-chip " + (g.phase === "play" ? "is-live" : "")}>{g.phase === "play" ? "LIVE" : "READY"}</span></div>
        <h3 className="q">{q ? q.question : "No question selected"}</h3>
        <div className="row question-nav">
          <select aria-label="Select a question" value={g.q} onChange={(e) => go({ type: "SELECT", i: +e.target.value })}>
            <option value={-1} disabled>Select a question to start…</option>
            {qs.map((x, i) => <option key={i} value={i}>{i + 1}. {x.question}</option>)}
          </select>
          <button onClick={() => go({ type: "PREV" })}>◀ PREVIOUS</button>
          <button className="go" onClick={() => go({ type: "NEXT" })}>NEXT QUESTION <kbd>N</kbd> ▶</button>
        </div>
      </section>

      <div className="console-grid">
        <section className="console-panel answers-panel">
          <div className="section-heading"><div><span className="eyebrow">LIVE BOARD</span><h2>ANSWERS</h2></div><span className="panel-count">{q?.answers.length || 0} SLOTS</span></div>
          {q?.answers.map((a, i) => (
            <div key={i} className={"ans " + (g.revealed[i] ? "done" : "")}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span className="answer-label">{a.answer}{g.awarded?.[i] && <small>AWARDED → {name(g.awarded[i])}</small>}</span>
              <em>{a.points} <small>PTS</small></em>
              <button disabled={g.revealed[i]} onClick={() => go({ type: "REVEAL", i })}>{g.revealed[i] ? "REVEALED" : "REVEAL"}</button>
            </div>
          ))}
          <button className="wide reveal-next" disabled={g.revealed.findIndex((x) => !x) < 0} onClick={() => go({ type: "REVEAL", i: g.revealed.findIndex((x) => !x) })}>REVEAL NEXT HIDDEN <kbd>R</kbd></button>
        </section>

        <div className="console-side">
          <section className="console-panel guess-panel">
            <div className="section-heading"><div><span className="eyebrow">ANSWER MATCHING</span><h2>TEAM GUESS</h2></div><kbd>ENTER</kbd></div>
            <div className="row guess-row">
              <input ref={input} autoFocus value={guess} placeholder="Enter the team's guess…"
                onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button className="go big" onClick={submit}>SUBMIT GUESS</button>
            </div>
          </section>

          <section className="console-panel controls-panel">
            <div className="section-heading"><div><span className="eyebrow">LIVE EVENT</span><h2>GAME CONTROLS</h2></div></div>
            <div className="control-grid">
              <button className="bad big" onClick={() => go({ type: "STRIKE" })}>STRIKE <kbd>S</kbd></button>
              <button className="gold" disabled={g.strikes < 3 || g.steal} onClick={() => go({ type: "STEAL" })}>STEAL CHANCE</button>
              <button onClick={() => go({ type: "UNSTRIKE" })}>REMOVE STRIKE</button>
              <span className="pill">STRIKES <b>{g.strikes}/3</b></span>
            </div>
            {g.steal && <span className="pill gold steal-pill">STEALING: {name(g.turn)}</span>}
          </section>

          <section className="console-panel teams-panel">
            <div className="section-heading"><div><span className="eyebrow">SCORE MANAGEMENT</span><h2>TEAMS <span className="pot-label">POT {g.pot}</span></h2></div></div>
            {["A", "B"].map((t) => (
              <div key={t} className={"team " + (g.turn === t ? "on" : "")}>
                <div className="team-score-row"><strong>{name(t)}</strong><span className="sc">{g["score" + t]}</span><button className="gold award-button" onClick={() => go({ type: "AWARD", t })}>AWARD POT</button></div>
                <div className="manual-adjustments" aria-label={`Manual score adjustments for ${name(t)}`}>
                  {[5, 10, 25, 50, -5, -10].map((d) => <button key={d} onClick={() => go({ type: "ADJ", t, d })}>{d > 0 ? "+" : ""}{d}</button>)}
                </div>
              </div>
            ))}
            <div className="row score-undo"><span>MANUAL CORRECTIONS</span><button disabled={!(g.awardHistory || []).length} onClick={() => go({ type: "UNDO_LAST_AWARD" })}>UNDO LAST AWARD</button></div>
            <button className="wide switch-button" onClick={() => go({ type: "SWITCH" })}>SWITCH TEAM — NOW {name(g.turn)}</button>
            <div className="secondary-controls">
              <button onClick={() => go({ type: "UNDO" })}>↶ UNDO <kbd>U</kbd></button>
              <button onClick={() => go({ type: "RESET_ROUND" })}>RESET ROUND</button>
              <button onClick={() => go({ type: "END" })}>FINAL SCOREBOARD</button>
              <button className="bad" onClick={() => confirm("Reset the entire game?") && go({ type: "RESTART" })}>RESTART GAME</button>
            </div>
          </section>
        </div>
      </div>
      {awardConfirmation ? (
        <div className="award-toast" role="status"><span>{name(awardConfirmation.team)} +{awardConfirmation.points}</span><small>{awardConfirmation.answer} AWARDED</small></div>
      ) : pendingAwardIndex >= 0 && q && (
        <div className="award-modal" role="dialog" aria-modal="true" aria-labelledby="award-title">
          <section className="award-card">
            <span className="eyebrow">ANSWER REVEALED · #{pendingAwardIndex + 1}</span>
            <h2 id="award-title">ANSWER REVEALED</h2>
            <div className="award-answer">{q.answers[pendingAwardIndex].answer}</div>
            <div className="award-points">+{q.answers[pendingAwardIndex].points}</div>
            <p>WHO GETS THE POINTS?</p>
            <div className="award-team-buttons">
              {["A", "B"].map((t) => <button key={t} onClick={() => awardTo(t)}>{name(t)}</button>)}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
