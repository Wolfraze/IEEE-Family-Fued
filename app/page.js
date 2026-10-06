"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Home() {
  const [hostUrl, setHostUrl] = useState("");
  const [hostUrls, setHostUrls] = useState([]);
  const [qr, setQr] = useState("");

  useEffect(() => {
    let active = true;
    const showQr = (url) => {
      setHostUrl(url);
      QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#061327", light: "#ffffff" } })
        .then((dataUrl) => { if (active) setQr(dataUrl); })
        .catch((error) => console.error("Could not generate host QR code:", error));
    };
    fetch("/api/connection", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not find a connectable address (${response.status}).`);
        return response.json();
      })
      .then(({ hostUrl: connectUrl, hostUrls: addresses }) => {
        if (!active) return;
        const options = Array.isArray(addresses) ? addresses : [];
        setHostUrls(options);
        showQr(connectUrl || `${window.location.origin}/host`);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not generate the host connection QR code:", error);
        showQr(`${window.location.origin}/host`);
      });
    return () => { active = false; };
  }, []);

  const chooseAddress = (url) => {
    setHostUrl(url);
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#061327", light: "#ffffff" } })
      .then(setQr)
      .catch((error) => console.error("Could not generate host QR code:", error));
  };

  return (
    <main className="home">
      <img className="home-logo" src="/ieee-logo.png" alt="IEEE SIES GST Student Branch logo" />
      <span className="home-kicker">IEEE DAY SHOWDOWN</span>
      <h1>IEEE Family Feud</h1>
      <p className="home-copy">Scan the QR code with the host phone, enter the private room code, and open the display on the projector.</p>
      <nav className="home-links" aria-label="Game pages">
        <a href="/host">OPEN HOST CONTROLLER</a>
        <a href="/display" target="_blank" rel="noreferrer">OPEN PROJECTOR DISPLAY</a>
      </nav>
      <section className="host-qr">
        <strong>SCAN TO OPEN THE HOST CONTROLLER</strong>
        {qr ? <img src={qr} alt={`QR code for ${hostUrl}`} width="220" height="220" /> : <span>Generating QR code…</span>}
        {hostUrl && <small>{hostUrl}</small>}
        {hostUrls.length > 1 && (
          <label className="home-network">
            <span className="home-network-label">CHOOSE PHONE NETWORK</span>
            <select value={hostUrl} onChange={(event) => chooseAddress(event.target.value)}>
              {hostUrls.map((option) => (
                <option key={option.hostUrl} value={option.hostUrl}>{option.label} · {option.address}</option>
              ))}
            </select>
          </label>
        )}
      </section>
    </main>
  );
}
