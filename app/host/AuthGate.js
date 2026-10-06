"use client";

import { useEffect, useState } from "react";

const HOST_CODE_KEY = "feud-host-code";

export default function AuthGate({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthenticated(Boolean(window.sessionStorage.getItem(HOST_CODE_KEY)));
    const failed = (event) => {
      setCode("");
      setError(event.detail?.message || "Incorrect room code. Please try again.");
      setAuthenticated(false);
    };
    window.addEventListener("feud-host-auth-failed", failed);
    return () => window.removeEventListener("feud-host-auth-failed", failed);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the room code to continue.");
      return;
    }
    window.sessionStorage.setItem(HOST_CODE_KEY, code.trim());
    setError("");
    setAuthenticated(true);
    window.dispatchEvent(new Event("feud-host-authenticated"));
  };

  if (authenticated) return children;
  return (
    <main className="host pin-gate">
      <form className="console-panel pin-card" onSubmit={submit}>
        <span className="eyebrow">JOIN THE GAME</span>
        <h1>Enter room code</h1>
        <p>Scan the host QR code or enter the room code shared by the game host.</p>
        <label htmlFor="host-code">Room code</label>
        <input id="host-code" type="text" autoComplete="one-time-code" autoCapitalize="characters" value={code}
          onChange={(event) => setCode(event.target.value)} autoFocus />
        {error && <p className="pin-error" role="alert">{error}</p>}
        <button className="go big" type="submit">JOIN AS HOST</button>
      </form>
    </main>
  );
}
