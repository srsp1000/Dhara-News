"use client";
// TodayWidgets.js — Weather, On This Day, Markets strip
// All free APIs, no keys needed for weather and Wikipedia

import { useState, useEffect } from "react";
import { useThemeValues } from "../../lib/useThemeValues";

const API = "";

// ── Weather Widget ─────────────────────────────────────────────────────────
export function WeatherWidget() {
  const t = useThemeValues();
  const [weather, setWeather] = useState(null);
  const [city,    setCity]    = useState("");
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) { setError(true); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // Open-Meteo: completely free, no API key, no rate limits
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&wind_speed_unit=kmh&timezone=Asia%2FKolkata`;
          const res = await fetch(url);
          const d   = await res.json();
          const c   = d.current;
          setWeather({
            temp:     Math.round(c.temperature_2m),
            feels:    Math.round(c.apparent_temperature),
            humidity: c.relative_humidity_2m,
            wind:     Math.round(c.wind_speed_10m),
            code:     c.weather_code,
          });

          // Reverse geocode city name — Open-Meteo nominatim
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&zoom=10`);
          const geo = await geoRes.json();
          setCity(geo.address?.city || geo.address?.town || geo.address?.state_district || "");
        } catch { setError(true); }
      },
      () => setError(true),
      { timeout: 8000 }
    );
  }, []);

  function weatherIcon(code) {
    if (code === 0) return "☀️";
    if (code <= 3)  return "⛅";
    if (code <= 48) return "🌫️";
    if (code <= 67) return "🌧️";
    if (code <= 77) return "🌨️";
    if (code <= 82) return "🌦️";
    if (code <= 99) return "⛈️";
    return "🌤️";
  }

  function weatherDesc(code) {
    if (code === 0)  return "Clear sky";
    if (code <= 3)   return "Partly cloudy";
    if (code <= 48)  return "Foggy";
    if (code <= 55)  return "Drizzle";
    if (code <= 67)  return "Rain";
    if (code <= 77)  return "Snow";
    if (code <= 82)  return "Rain showers";
    return "Thunderstorm";
  }

  if (error || !weather) return null;

  return (
    <div style={{
      background: t.bg2, border: `1px solid ${t.border}`,
      borderRadius: 3, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 28 }}>{weatherIcon(weather.code)}</span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: t.text1 }}>
          {weather.temp}°C
          {city && <span style={{ fontSize: 12, fontWeight: 400, color: t.text3, marginLeft: 6 }}>{city}</span>}
        </div>
        <div style={{ fontSize: 12, color: t.text3 }}>
          {weatherDesc(weather.code)} · Feels {weather.feels}°C · Humidity {weather.humidity}% · Wind {weather.wind} km/h
        </div>
      </div>
    </div>
  );
}

// ── On This Day Widget ─────────────────────────────────────────────────────
export function OnThisDayWidget() {
  const t = useThemeValues();
  const [events, setEvents]     = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [dateStr, setDateStr]   = useState("");

  useEffect(() => {
    const now   = new Date();
    const month = String(now.getMonth() + 1);
    const day   = String(now.getDate());
    setDateStr(now.toLocaleDateString("en-IN", { day: "numeric", month: "long" }));

    // First try our cached API endpoint
    fetch(`${API}/api/today/history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.events?.length) {
          setEvents(d.events.slice(0, 6));
        } else {
          // Direct Wikipedia fallback
          return fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`, {
            headers: { "Accept": "application/json" }
          }).then(r => r.json()).then(data => {
            const evs = (data.events || [])
              .filter(e => e.text && e.year)
              .slice(0, 6)
              .map(e => ({ year: e.year, text: e.text }));
            setEvents(evs);
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!events.length) return null;

  const displayEvents = expanded ? events : events.slice(0, 3);

  return (
    <div style={{
      background: t.bg2, border: `1px solid ${t.border}`,
      borderRadius: 3, padding: "12px 14px", marginBottom: 12,
    }}>
      <div style={{
        fontFamily: "'Georgia','Times New Roman',serif",
        fontSize: 14, fontWeight: 700, color: t.text1,
        marginBottom: 10, display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span>📅 On This Day — {dateStr}</span>
        <button onClick={() => setExpanded(e => !e)}
          style={{ fontSize: 11, color: t.text3, background: "none", border: "none", cursor: "pointer" }}>
          {expanded ? "Show less" : `+${events.length - 3} more`}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayEvents.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: t.accent,
              flexShrink: 0, minWidth: 36, paddingTop: 1,
            }}>{ev.year}</span>
            <span style={{ fontSize: 12, color: t.text2, lineHeight: 1.5 }}>
              {ev.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Markets Widget (links to live data) ───────────────────────────────────
export function MarketsWidget() {
  const t = useThemeValues();
  const fallbackMarkets = [
    { name: "Sensex",   url: "https://www.nseindia.com", hint: "BSE 30" },
    { name: "Nifty 50", url: "https://www.nseindia.com/market-data/live-equity-market", hint: "NSE 50" },
    { name: "Gold",     url: "https://www.mcxindia.com/market-data/commodity-market-watch/0/Gold", hint: "MCX" },
    { name: "₹/USD",    url: "https://www.rbi.org.in/home.aspx", hint: "RBI" },
  ];
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/markets`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setMarkets(Array.isArray(data) ? data : []))
      .catch(() => setMarkets([]));
  }, []);

  const displayMarkets = markets.length ? markets : fallbackMarkets;

  const fmtPrice = (v) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "--";
    return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  const fmtChange = (chg, pct) => {
    if (chg === null || chg === undefined || pct === null || pct === undefined) return "Live value unavailable";
    const c = Number(chg);
    const p = Number(pct);
    const sign = c > 0 ? "+" : "";
    return `${sign}${c.toFixed(2)} (${sign}${p.toFixed(2)}%)`;
  };

  return (
    <div style={{
      background: t.bg2, border: `1px solid ${t.border}`,
      borderRadius: 3, padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.text3,
        letterSpacing: 0.8, textTransform: "uppercase",
        marginBottom: 8,
      }}>
        Markets
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {displayMarkets.map(m => (
          <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: "flex", flexDirection: "column",
              padding: "6px 8px", borderRadius: 3,
              border: `1px solid ${t.border}`,
              textDecoration: "none",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = t.bg3}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.text1 }}>{m.name}</span>
            <span style={{ fontSize: 10, color: t.text3 }}>
              {fmtPrice(m.price)} · {m.hint} ↗
            </span>
            <span style={{
              fontSize: 10,
              color: Number(m.change || 0) >= 0 ? "#166534" : "#991b1b",
            }}>
              {fmtChange(m.change, m.change_percent)}
            </span>
          </a>
        ))}
      </div>
      <div style={{ fontSize: 10, color: t.text3, marginTop: 6, textAlign: "right" }}>
        Live data: Yahoo Finance (cached 60s)
      </div>
    </div>
  );
}

// ── Fact-check Request Widget ─────────────────────────────────────────────
export function FactCheckRequest() {
  const t = useThemeValues();
  const [claim,    setClaim]    = useState("");
  const [submitted, setSubmit]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    if (!claim.trim() || claim.length < 15) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/factcheck/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: claim.trim() }),
      });
      setSubmit(true);
    } catch {}
    setLoading(false);
  };

  if (submitted) {
    return (
      <div style={{
        background: "#f0fdf4", border: "1px solid #bbf7d0",
        borderRadius: 3, padding: "10px 14px", marginBottom: 12,
        fontSize: 13, color: "#166534",
      }}>
        ✓ Claim submitted for verification. We'll publish our findings shortly.
      </div>
    );
  }

  return (
    <div style={{
      background: t.bg2, border: `1px solid ${t.border}`,
      borderRadius: 3, padding: "12px 14px", marginBottom: 12,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: t.text1,
        fontFamily: "'Georgia','Times New Roman',serif",
        marginBottom: 8,
      }}>
        🔍 Request a Fact-Check
      </div>
      <div style={{ fontSize: 12, color: t.text2, marginBottom: 8, lineHeight: 1.5 }}>
        Seen a suspicious claim? Submit it and our verification pipeline will check it.
      </div>
      <textarea
        value={claim} onChange={e => setClaim(e.target.value)}
        placeholder="Paste the claim or headline you want verified…"
        rows={2}
        style={{
          width: "100%", padding: "8px 10px",
          border: `1px solid ${t.border}`, borderRadius: 3,
          fontSize: 12, resize: "vertical", outline: "none",
          background: t.bg3, color: t.text1,
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      />
      <button onClick={submit} disabled={loading || claim.length < 15}
        style={{
          marginTop: 8, width: "100%", padding: "8px",
          background: claim.length >= 15 ? t.accent : t.border,
          color: "#fff", border: "none", borderRadius: 3,
          fontSize: 12, fontWeight: 600,
          cursor: claim.length >= 15 ? "pointer" : "not-allowed",
        }}>
        {loading ? "Submitting…" : "Submit for verification"}
      </button>
    </div>
  );
}
