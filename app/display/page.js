"use client";
import { useEffect, useRef, useState } from "react";
import { connectRealtime, subscribeRealtimeStatus } from "../../lib/realtime";
import { initialState } from "../../lib/gameLogic";

function useDisplaySync() {
  const [game, setGame] = useState(initialState());
  const [sync, setSync] = useState({ status: "syncing", message: "" });
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem("feud-game");
      if (cached) setGame(JSON.parse(cached));
    } catch {
      setGame(initialState());
    }
    const receiveState = (event) => {
      if (event.detail?.game) setGame(event.detail.game);
    };
    const updateStatus = (status, message) => setSync({ status, message });
    window.addEventListener("feud-state-update", receiveState);
    const unsubscribe = subscribeRealtimeStatus(updateStatus);
    const disconnect = connectRealtime("display");
    return () => {
      window.removeEventListener("feud-state-update", receiveState);
      unsubscribe();
      disconnect();
    };
  }, []);
  return { game, ...sync };
}

function Score({ v }) {
  const [shown, setShown] = useState(v);
  const current = useRef(v);

  useEffect(() => {
    const from = current.current;
    const started = performance.now();
    let frame;
    const duration = Math.min(1000, Math.max(350, Math.abs(v - from) * 12));
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (v - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else current.current = v;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [v]);

  return <b className="score-count">{shown}</b>;
}

function GameIntro({ introId, onIntroSound }) {
  const canvasRef = useRef(null);
  const flashRef = useRef(null);
  const startIntroRef = useRef(() => {});
  const replayIntroRef = useRef(() => {});
  const [mode, setMode] = useState("idle");
  const modeRef = useRef("idle");
  const onIntroSoundRef = useRef(onIntroSound);
  onIntroSoundRef.current = onIntroSound;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: false });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stars = Array.from({ length: 420 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      depth: 0.15 + Math.random() * 0.85,
      size: 0.35 + Math.random() * 1.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 1.15,
      opacity: 0.2 + Math.random() * 0.36,
      drift: 0.0007 + Math.random() * 0.0018,
      color: Math.random() < 0.68 ? "#ffffff" : "#d9edff",
    }));
    const sparkles = Array.from({ length: 54 }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: 80 + Math.random() * Math.min(window.innerWidth, window.innerHeight) * 0.34,
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.85,
    }));
    let width = 0;
    let height = 0;
    let dpr = 1;
    let startedAt = performance.now();
    let lastFrame = startedAt;
    let frame = 0;
    let autoStartTimer = 0;
    let shootingTimer = 0;
    let shootingStar = null;
    let disposed = false;

    const setIntroMode = (next) => {
      modeRef.current = next;
      startedAt = performance.now();
      setMode(next);
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const launch = () => {
      if (modeRef.current !== "idle") return;
      window.clearTimeout(autoStartTimer);
      onIntroSoundRef.current();
      setIntroMode(reducedMotion.matches ? "title" : "warp");
    };
    const replay = () => {
      window.clearTimeout(autoStartTimer);
      onIntroSoundRef.current();
      setIntroMode("idle");
      launch();
    };
    startIntroRef.current = launch;
    replayIntroRef.current = replay;
    const keydown = (event) => {
      if ((event.code === "Space" || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        if (modeRef.current === "idle") launch();
        else if (modeRef.current === "title") replay();
      }
    };
    const scheduleShootingStar = () => {
      shootingTimer = window.setTimeout(() => {
        if (modeRef.current !== "warp") {
          shootingStar = {
            x: width * (0.12 + Math.random() * 0.78),
            y: height * (0.04 + Math.random() * 0.46),
            progress: 0,
            duration: 650 + Math.random() * 450,
            angle: 0.32 + Math.random() * 0.26,
          };
        }
        scheduleShootingStar();
      }, 6000 + Math.random() * 2000);
    };
    const draw = (time) => {
      if (disposed) return;
      const delta = Math.min(50, time - lastFrame);
      lastFrame = time;

      const background = context.createRadialGradient(
        width * 0.5, height * 0.47, 0,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.78
      );
      background.addColorStop(0, "#0a0a0f");
      background.addColorStop(0.58, "#08090f");
      background.addColorStop(1, "#05060a");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const glow = (x, y, radius, alpha) => {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(0, 98, 155, ${alpha})`);
        gradient.addColorStop(1, "rgba(0, 98, 155, 0)");
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };
      glow(width * 0.04, height * 0.06, Math.max(width, height) * 0.3, 0.16);
      glow(width * 0.96, height * 0.94, Math.max(width, height) * 0.27, 0.14);

      const elapsed = time - startedAt;
      const progress = modeRef.current === "warp" ? Math.min(1, elapsed / 2500) : 0;
      const eased = progress * progress * progress;
      const expansion = modeRef.current === "warp" ? 1 + eased * 7.5 : 1;
      const centerX = width / 2;
      const centerY = height / 2;

      for (const star of stars) {
        if (modeRef.current !== "warp") {
          star.x += star.drift * delta * 0.42;
          if (star.x > 1.12) star.x = -1.12;
        }
        const x = centerX + star.x * width * 0.56 * expansion
          + Math.sin(time * 0.00008 + star.phase) * (1 - star.depth) * 8;
        const y = centerY + star.y * height * 0.56 * expansion
          + Math.cos(time * 0.00006 + star.phase) * (1 - star.depth) * 6;
        const radius = star.size * (0.5 + star.depth * 0.9);
        const twinkle = star.opacity * (0.68 + Math.sin(time * 0.001 * star.speed + star.phase) * 0.3);

        if (modeRef.current === "warp") {
          const previousExpansion = 1 + Math.max(0, eased - 0.035) * 7.5;
          context.beginPath();
          context.moveTo(centerX + star.x * width * 0.56 * previousExpansion, centerY + star.y * height * 0.56 * previousExpansion);
          context.lineTo(x, y);
          context.strokeStyle = `rgba(174, 229, 255, ${Math.min(0.95, 0.18 + progress * 0.85)})`;
          context.lineWidth = radius * (1 + progress * 2.5);
          context.stroke();
        } else if (x > -5 && x < width + 5 && y > -5 && y < height + 5) {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = `${star.color}${Math.round(twinkle * 255).toString(16).padStart(2, "0")}`;
          context.fill();
        }
      }

      if (modeRef.current === "title") {
        const sparkleFade = Math.min(1, elapsed / 700) * Math.max(0, 1 - Math.max(0, elapsed - 6500) / 2500);
        for (const sparkle of sparkles) {
          const wave = Math.sin(time * 0.001 * sparkle.speed + sparkle.phase);
          const distance = sparkle.distance + wave * 8;
          const x = centerX + Math.cos(sparkle.angle) * distance;
          const y = centerY + Math.sin(sparkle.angle) * distance * 0.55;
          context.fillStyle = `rgba(206, 232, 255, ${(0.2 + (wave + 1) * 0.25) * sparkleFade})`;
          context.fillRect(x, y, sparkle.size, sparkle.size);
        }
      }

      if (shootingStar && modeRef.current !== "warp") {
        shootingStar.progress += delta / shootingStar.duration;
        if (shootingStar.progress >= 1) {
          shootingStar = null;
        } else {
          const length = Math.min(width, height) * 0.14;
          const x = shootingStar.x + shootingStar.progress * length * 1.6;
          const y = shootingStar.y + shootingStar.progress * length * shootingStar.angle;
          const alpha = Math.sin(shootingStar.progress * Math.PI);
          const tail = context.createLinearGradient(x, y, x - length, y - length * shootingStar.angle);
          tail.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
          tail.addColorStop(0.3, `rgba(84,200,255,${alpha * 0.4})`);
          tail.addColorStop(1, "rgba(84,200,255,0)");
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x - length, y - length * shootingStar.angle);
          context.strokeStyle = tail;
          context.lineWidth = 1;
          context.stroke();
        }
      }

      if (modeRef.current === "warp" && elapsed >= 2500) setIntroMode("title");
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("keydown", keydown);
    autoStartTimer = window.setTimeout(launch, 5000);
    shootingTimer = window.setTimeout(scheduleShootingStar, 6000 + Math.random() * 2000);
    frame = window.requestAnimationFrame(draw);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(autoStartTimer);
      window.clearTimeout(shootingTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  useEffect(() => {
    if (introId > 0) replayIntroRef.current();
  }, [introId]);

  useEffect(() => {
    if (mode !== "warp") return undefined;
    const flash = flashRef.current;
    flash?.classList.remove("fire");
    const timer = window.setTimeout(() => {
      if (!flash) return;
      void flash.offsetWidth;
      flash.classList.add("fire");
    }, 1800);
    return () => {
      window.clearTimeout(timer);
      flash?.classList.remove("fire");
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "title") return undefined;
    const timer = window.setTimeout(() => replayIntroRef.current(), 30000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  return (
    <section className={`display-intro ${mode === "title" ? "is-title" : ""}`} aria-label="IEEE Family Feud introduction">
      <canvas ref={canvasRef} className="intro-starfield" aria-hidden="true" />
      <div className="intro-vignette" aria-hidden="true" />
      <div ref={flashRef} className="intro-flash" aria-hidden="true" />
      <div className="intro-content">
        <p className="intro-eyebrow">IEEE DAY 2026</p>
        <h1 className="intro-title">
          <span>IEEE</span><span>FAMILY</span><span>FEUD</span>
        </h1>
        <p className="intro-subtitle">IEEE SIES GST Student Branch</p>
      </div>
      <div className="intro-controls">
        {mode === "idle" && <button type="button" onClick={() => startIntroRef.current()}>START</button>}
      </div>
    </section>
  );
}

export default function Display() {
  const { game: g, status: syncStatus, message: syncMessage } = useDisplaySync();
  const [board, setBoard] = useState({ currentQuestion: null, answers: [], answerCount: 0, multiplier: 1 });
  const [ov, setOv] = useState(null);
  const seen = useRef(new Set()), timer = useRef(null);
  const queue = useRef([]), playing = useRef(false), advance = useRef(null);
  const audio = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(false), [muted, setMuted] = useState(false);
  const [soundError, setSoundError] = useState("");
  const soundSettings = useRef({ enabled: false, muted: false });
  soundSettings.current = { enabled: soundEnabled, muted };

  const playSound = (kind) => {
    const context = audio.current;
    if (!soundSettings.current.enabled || soundSettings.current.muted || !context) return;
    const tone = (frequency, start, duration, type = "sine", endFrequency = frequency, volume = 0.12) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };
    const now = context.currentTime;
    if (kind === "correct") {
      tone(740, now, 0.22); tone(988, now + 0.09, 0.3);
    } else if (kind === "strike") {
      const duration = 1.1;
      const osc1 = context.createOscillator();
      const osc2 = context.createOscillator();
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc1.frequency.setValueAtTime(130, now);
      osc2.frequency.setValueAtTime(137, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(1, now + 0.02);
      gain.gain.setValueAtTime(1, now + duration - 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      compressor.threshold.value = -20;
      compressor.ratio.value = 12;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(compressor).connect(context.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } else if (kind === "award") {
      [659, 784, 988].forEach((frequency, index) => tone(frequency, now + index * 0.08, 0.36));
      tone(523, now + 0.2, 0.6, "triangle", 784, 0.07);
    } else if (kind === "intro") {
      tone(90, now, 1.1, "sawtooth", 520, 0.12);
      [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, now + 0.85 + index * 0.13, 0.65, "triangle", frequency, 0.09));
    }
  };
  const enableSound = async () => {
    try {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not supported by this browser.");
      audio.current ||= new AudioContextClass();
      await audio.current.resume();
      setSoundEnabled(true);
      setMuted(false);
      setSoundError("");
    } catch (error) {
      setSoundError(`Sound could not be enabled: ${error.message}`);
    }
  };

  useEffect(() => {
    advance.current = () => {
      if (playing.current) return;
      const next = queue.current.shift();
      if (!next) { setOv(null); return; }
      playing.current = true;
      setOv(next);
      const duration = next.type === "correct" ? 1400 : next.type === "award" ? 1900 : 1800;
      timer.current = setTimeout(() => {
        playing.current = false;
        advance.current?.();
      }, duration);
    };
  }, []);
  useEffect(() => {
    const receive = (event) => {
      const snapshot = event.detail;
      setBoard({
        currentQuestion: snapshot.currentQuestion,
        answers: snapshot.answers || [],
        answerCount: snapshot.answerCount || 0,
        multiplier: snapshot.multiplier || 1,
      });
      const currentEvent = snapshot.game?.event;
      if (!currentEvent || !currentEvent.id) return;
      if (snapshot.initialSnapshot) {
        seen.current.add(currentEvent.id);
        return;
      }
      if (seen.current.has(currentEvent.id)) return;
      seen.current.add(currentEvent.id);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value);
      if (snapshot.game?.phase !== "play") return;
      if (!["correct", "strike", "steal", "award"].includes(currentEvent.type)) return;
      queue.current.push(currentEvent);
      playSound(currentEvent.type);
      advance.current?.();
    };
    window.addEventListener("feud-state-update", receive);
    return () => window.removeEventListener("feud-state-update", receive);
  }, []);
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      audio.current?.close();
    };
  }, []);
  useEffect(() => {
    const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    const k = (e) => e.key.toLowerCase() === "f" && fs();
    window.addEventListener("keydown", k); window.addEventListener("dblclick", fs);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("dblclick", fs); };
  }, []);

  const q = board.currentQuestion;
  const winner = g.scoreA === g.scoreB ? "IT'S A TIE!" : g.scoreA > g.scoreB ? g.teamA : g.teamB;
  const turnName = g.turn === "A" ? g.teamA : g.teamB;
  const roundNumber = String((q?.index ?? g.q) + 1).padStart(2, "0");

  return (
    <div className="screen"><div className={"stage " + (g.phase === "ready" ? "intro-stage" : "")}>
      <div className="stage-lights" aria-hidden="true" />
      {g.phase === "ready" && <GameIntro introId={g.introId || 0} onIntroSound={() => playSound("intro")} />}
      <div className="display-audio-controls">
        {!soundEnabled ? <button type="button" onClick={enableSound}>Enable sound</button> : (
          <button type="button" aria-pressed={!muted} onClick={() => setMuted((value) => !value)}>{muted ? "Unmute sound" : "Mute sound"}</button>
        )}
        {soundError && <span role="alert">{soundError}</span>}
      </div>
      <div className={"display-sync-status " + syncStatus} role="status" title={syncMessage}>
        <i aria-hidden="true" />
        {syncStatus === "online" ? "LIVE" : syncStatus === "offline" ? "OFFLINE" : "CONNECTING"}
      </div>

      {g.phase === "final" && (
        <div className="center final">
          {Array.from({ length: 36 }, (_, i) => <i key={i} className="conf" style={{ left: (i * 2.8) % 100 + "%", animationDelay: (i % 9) * 0.25 + "s", background: ["#ffc72c", "#3fd0ff", "#fff", "#ff3b4e"][i % 4] }} />)}
          <div className="final-brand"><img src="/ieee-logo.png" alt="IEEE SIES GST Student Branch logo" /><span>IEEE DAY<br />CHAMPIONSHIP</span></div><h1 className="logo sm">IEEE FAMILY FEUD</h1><h2>FINAL SCORE</h2>
          <div className="finalrow">
            <div><span>{g.teamA}</span><Score v={g.scoreA} /></div><div><span>{g.teamB}</span><Score v={g.scoreB} /></div>
          </div>
          <h3>WINNER</h3><div className="winner">{winner}</div><p className="champion-tag">IEEE DAY CHAMPIONS</p>
        </div>
      )}

      {g.phase === "play" && q && (<>
        <header className="show-header">
          <div className="brand-lockup"><img className="brand-emblem" src="/ieee-logo.png" alt="IEEE SIES GST Student Branch logo" /><div><h1>IEEE FAMILY FEUD</h1><p>IEEE DAY SHOWDOWN</p></div></div>
          <div className="round-label">ROUND <b>{roundNumber}</b> · ×{board.multiplier}</div>
          <div className="live-indicator"><i /> ON AIR</div>
        </header>
        <div className="game-content">
          <h2 key={q.index + "-" + g.event?.type} className={"question " + (g.event?.type === "question" ? "enter" : "")}>{q.question}</h2>
          <div className={"board " + (g.event?.type === "question" ? "board-enter" : "") + (board.answerCount > 6 ? " board-wide" : "")} style={{ "--answer-count": board.answerCount }}>
            {board.answers.map((a, i) => (
              <div key={i} className={"card " + (a.revealed ? "flip" : "")} style={{ "--slot-index": i }}><div className="in">
                <div className="f front"><span className="n">{i + 1}</span><span className="hidden-label">MYSTERY ANSWER</span><span className="concealed-mark">?</span></div>
                <div className="f back"><span className="t">{a.revealed ? a.text : ""}</span><span className="p">{a.revealed ? a.points : ""}</span></div>
              </div></div>
            ))}
          </div>
        </div>
        <footer className="show-footer">
          <div className={"tm " + (g.turn === "A" ? "on" : "")}><span className="team-label">TEAM A</span><span className="team-name">{g.teamA}</span><Score v={g.scoreA} /></div>
          <div className="footer-center">
            {g.steal && <div className="turn">STEAL CHANCE</div>}
            <div className="pot"><span>ROUND POT</span><Score v={g.pot} /></div>
          </div>
          <div className={"tm " + (g.turn === "B" ? "on" : "")}><span className="team-label">TEAM B</span><span className="team-name">{g.teamB}</span><Score v={g.scoreB} /></div>
        </footer>
      </>)}

      {ov?.type === "correct" && <div className="ov good" key={ov.id}><div className="reveal-kicker">ANSWER REVEALED</div><div className="rk">#{ov.rank}</div><div className="an">{ov.answer}</div><div className="pt">{ov.points} POINTS</div></div>}
      {ov?.type === "strike" && <div className={"ov bad " + (ov.count >= 3 ? "triple-strike" : "")} key={ov.id}><div className="bigx">X</div><div className="big">STRIKE!</div></div>}
      {ov?.type === "steal" && <div className="ov gold" key={ov.id}><div className="reveal-kicker">THE BOARD IS OPEN</div><div className="big">STEAL CHANCE!</div><div className="an">{turnName}</div></div>}
      {ov?.type === "award" && <div className="ov award" key={ov.id}><div className="reveal-kicker">{ov.team === "A" ? g.teamA : g.teamB} AWARDED</div><div className="an">{ov.answer}</div><div className="award-count"><b>+{ov.points}</b><span>{ov.before}</span><i>→</i><strong>{ov.score}</strong></div></div>}
    </div></div>
  );
}
