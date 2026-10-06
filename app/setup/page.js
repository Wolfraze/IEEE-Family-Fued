"use client";
import { useEffect, useState } from "react";
import { KEYS, read, write, useSyncStatus } from "../../lib/storage";
import { initialState } from "../../lib/gameLogic";
import { sendRealtime } from "../../lib/realtime";
import { validQuestions } from "../../lib/questionValidation.cjs";
import AuthGate from "../host/AuthGate";

export default function Setup() {
  return <AuthGate><SetupEditor /></AuthGate>;
}

function SetupEditor() {
  const [a, setA] = useState(""), [b, setB] = useState("");
  const [questions, setQuestions] = useState([]);
  const [text, setText] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [msg, setMsg] = useState("");
  const { status: syncStatus, message: syncMessage } = useSyncStatus();

  useEffect(() => {
    const hydrate = (game, nextQuestions) => {
      setA(game.teamA);
      setB(game.teamB);
      setQuestions(nextQuestions);
      setText(JSON.stringify(nextQuestions, null, 2));
    };
    hydrate(read(KEYS.game, initialState()), read(KEYS.q, []));
    const receive = (event) => {
      if (event.detail.questions) hydrate(event.detail.game, event.detail.questions);
    };
    window.addEventListener("feud-state-update", receive);
    return () => window.removeEventListener("feud-state-update", receive);
  }, []);

  const updateQuestion = (index, key, value) => {
    setQuestions((current) => current.map((question, i) => i === index ? { ...question, [key]: value } : question));
  };
  const updateAnswer = (questionIndex, answerIndex, key, value) => {
    setQuestions((current) => current.map((question, i) => i !== questionIndex ? question : {
      ...question,
      answers: question.answers.map((answer, j) => j === answerIndex ? { ...answer, [key]: value } : answer),
    }));
  };

  const save = () => {
    try {
      const nextQuestions = advanced ? JSON.parse(text) : questions;
      if (!validQuestions(nextQuestions)) {
        throw new Error("Questions must have valid text, 1–20 answers, non-negative point values, up to 30 aliases, and a multiplier of 1, 2, or 3.");
      }
      const questionsSent = write(KEYS.q, nextQuestions);
      const teamsSent = write(KEYS.game, { ...read(KEYS.game, initialState()), teamA: a || "TEAM A", teamB: b || "TEAM B" });
      setQuestions(nextQuestions);
      setText(JSON.stringify(nextQuestions, null, 2));
      setMsg(questionsSent && teamsSent
        ? "Saved to the game server. Use “Restart entire game” on the host page if a game is in progress."
        : "Saved on this device only; reconnect as the host and save again to sync.");
    } catch (error) {
      setMsg(`Not saved: ${error.message}`);
    }
  };

  const restore = () => {
    const sent = sendRealtime({ type: "SETUP", key: "reset-questions" });
    setMsg(sent ? "Restoring default questions from the game server…" : "Could not reach the game server. Reconnect as the host and try again.");
  };

  const addQuestion = () => setQuestions((current) => [...current, {
    id: Date.now(),
    question: "",
    multiplier: 1,
    answers: [{ answer: "", points: 0, aliases: [] }],
  }]);
  const removeQuestion = (index) => setQuestions((current) => current.filter((_, i) => i !== index));
  const addAnswer = (questionIndex) => setQuestions((current) => current.map((question, i) => i === questionIndex
    ? { ...question, answers: [...question.answers, { answer: "", points: 0, aliases: [] }] }
    : question));
  const removeAnswer = (questionIndex, answerIndex) => setQuestions((current) => current.map((question, i) => i === questionIndex
    ? { ...question, answers: question.answers.filter((_, j) => j !== answerIndex) }
    : question));

  return (
    <div className="host setup">
      <header><a className="setup-brand" href="/"><img src="/ieee-logo.png" alt="IEEE SIES GST Student Branch logo" /><span><strong>IEEE FAMILY FEUD</strong><small>SETUP</small></span></a><span className={"network-status " + syncStatus} title={syncMessage}>{syncStatus === "online" ? "LIVE" : syncStatus === "offline" ? "OFFLINE" : "CONNECTING"}</span><a href="/host">Go to host</a></header>
      {(syncStatus !== "online" || syncMessage) && <div className="connection-banner" role="status">{syncMessage || "Connecting to the game server…"}</div>}
      <section className="row"><input value={a} onChange={(event) => setA(event.target.value)} placeholder="Team A name" /><input value={b} onChange={(event) => setB(event.target.value)} placeholder="Team B name" /></section>
      <p>Edit questions below. Answer order sets rank. Add up to 30 aliases per answer.</p>
      <button type="button" onClick={() => {
        if (!advanced) setText(JSON.stringify(questions, null, 2));
        else {
          try { setQuestions(JSON.parse(text)); } catch (error) { setMsg(`Invalid JSON: ${error.message}`); return; }
        }
        setAdvanced(!advanced);
      }}>{advanced ? "Use form editor" : "Advanced: edit JSON"}</button>
      {advanced ? (
        <textarea aria-label="Advanced questions JSON" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
      ) : (
        <div className="question-editor">
          {questions.map((question, questionIndex) => (
            <section className="console-panel editor-question" key={question.id || questionIndex}>
              <div className="section-heading"><h2>QUESTION {questionIndex + 1}</h2><button className="bad" type="button" onClick={() => removeQuestion(questionIndex)}>Remove question</button></div>
              <label>Question text<input maxLength={500} value={question.question} onChange={(event) => updateQuestion(questionIndex, "question", event.target.value)} /></label>
              <label>Round multiplier<select value={question.multiplier || 1} onChange={(event) => updateQuestion(questionIndex, "multiplier", Number(event.target.value))}>
                {[1, 2, 3].map((value) => <option key={value} value={value}>×{value}</option>)}
              </select></label>
              {question.answers.map((answer, answerIndex) => (
                <div className="editor-answer" key={answerIndex}>
                  <label>Answer {answerIndex + 1}<input maxLength={200} value={answer.answer} onChange={(event) => updateAnswer(questionIndex, answerIndex, "answer", event.target.value)} /></label>
                  <label>Points<input type="number" min="0" value={answer.points} onChange={(event) => updateAnswer(questionIndex, answerIndex, "points", event.target.value === "" ? "" : Number(event.target.value))} /></label>
                  <label>Aliases (comma-separated)<input value={(answer.aliases || []).join(", ")} onChange={(event) => updateAnswer(questionIndex, answerIndex, "aliases", event.target.value.split(",").map((alias) => alias.trim()).filter(Boolean))} /></label>
                  <button type="button" onClick={() => removeAnswer(questionIndex, answerIndex)}>Remove answer</button>
                </div>
              ))}
              <button type="button" onClick={() => addAnswer(questionIndex)}>Add answer</button>
            </section>
          ))}
          <button type="button" onClick={addQuestion}>Add question</button>
        </div>
      )}
      <section className="row"><button className="go big" onClick={save}>Save setup</button><button onClick={restore}>Restore default questions</button><span role="status">{msg}</span></section>
    </div>
  );
}
