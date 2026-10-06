"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [lanOrigin, setLanOrigin] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/network", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Network discovery failed (${response.status}).`);
        return response.json();
      })
      .then(({ addresses: available, port }) => {
        if (!active || !Array.isArray(available) || !available.length) return;
        const currentHost = window.location.hostname;
        const preferred = available.includes(currentHost) ? currentHost : available[0];
        setAddresses(available);
        setSelectedAddress(preferred);
        setLanOrigin(`${window.location.protocol}//${preferred}:${port || window.location.port || 3000}`);
      })
      .catch((error) => {
        if (active) console.error("Could not discover the server's LAN address:", error);
      });
    return () => { active = false; };
  }, []);

  const chooseAddress = (address) => {
    setSelectedAddress(address);
    setLanOrigin(`${window.location.protocol}//${address}:${window.location.port || 3000}`);
  };

  return (
    <main className="home">
      <span className="home-kicker">LOCAL NETWORK GAME</span>
      <h1>IEEE Family Feud</h1>
      <p className="home-copy">Use these network links on the host and projector devices.</p>
      <div className="home-network">
        <span className="home-network-label">NETWORK ADDRESS</span>
        {addresses.length > 1 ? (
          <select aria-label="Choose network interface" value={selectedAddress} onChange={(event) => chooseAddress(event.target.value)}>
            {addresses.map((address) => <option key={address} value={address}>{address}</option>)}
          </select>
        ) : (
          <strong>{selectedAddress || "Finding network…"}</strong>
        )}
        <small>Both devices must be on the same Wi-Fi or local network.</small>
      </div>
      <a href={lanOrigin ? `${lanOrigin}/host` : "/host"}>OPEN HOST CONTROLLER</a>
      <a href={lanOrigin ? `${lanOrigin}/display` : "/display"} target="_blank" rel="noreferrer">OPEN PROJECTOR DISPLAY</a>
      <a className="home-setup" href={lanOrigin ? `${lanOrigin}/setup` : "/setup"}>SETUP GAME</a>
    </main>
  );
}
