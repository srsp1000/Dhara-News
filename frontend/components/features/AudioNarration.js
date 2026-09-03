"use client";
// AudioNarration.js — Text-to-speech using Web Speech API (free, no API key)
// Falls back gracefully on unsupported browsers

import { useState, useEffect, useRef } from "react";
import { useThemeValues } from "../../lib/useThemeValues";

export default function AudioNarration({ text, headline }) {
  const t = useThemeValues();
  const [playing,   setPlaying]   = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [supported, setSupported] = useState(false);
  const [speed,     setSpeed]     = useState(1);
  const [progress,  setProgress]  = useState(0);
  const uttRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    setSupported("speechSynthesis" in window);
    return () => { stopAll(); };
  }, []);

  // Re-start when text changes
  useEffect(() => { if (playing) { stopAll(); setPlaying(false); setPaused(false); } }, [text]);

  const stopAll = () => {
    window.speechSynthesis?.cancel();
    clearInterval(intervalRef.current);
    setProgress(0);
  };

  const getVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    // Prefer Indian English voice
    return voices.find(v => v.lang === "en-IN")
      || voices.find(v => v.lang.startsWith("en") && v.name.includes("Google"))
      || voices.find(v => v.lang.startsWith("en"))
      || voices[0];
  };

  const speak = () => {
    if (!supported) return;
    stopAll();

    const fullText = headline ? `${headline}. ${text}` : text;
    const utter = new SpeechSynthesisUtterance(fullText);
    utter.rate   = speed;
    utter.pitch  = 1;
    utter.volume = 1;
    utter.voice  = getVoice();

    const words = fullText.split(/\s+/).length;
    const estMs = (words / (speed * 2.5)) * 1000;
    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(100, (elapsed / estMs) * 100));
    }, 200);

    utter.onend = () => {
      clearInterval(intervalRef.current);
      setPlaying(false); setPaused(false); setProgress(0);
    };
    utter.onerror = () => {
      clearInterval(intervalRef.current);
      setPlaying(false); setPaused(false); setProgress(0);
    };

    uttRef.current = utter;
    window.speechSynthesis.speak(utter);
    setPlaying(true); setPaused(false);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    clearInterval(intervalRef.current);
    setPaused(true);
  };

  const resume = () => {
    window.speechSynthesis.resume();
    const words = (headline ? `${headline}. ${text}` : text).split(/\s+/).length;
    const remaining = ((100 - progress) / 100) * (words / (speed * 2.5)) * 1000;
    const startProg = progress;
    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(100, startProg + (elapsed / remaining) * (100 - startProg)));
    }, 200);
    setPaused(false);
  };

  const stop = () => { stopAll(); setPlaying(false); setPaused(false); };

  if (!supported) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {!playing ? (
        <button onClick={speak} title="Listen to article"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.bg2, color: t.text2,
            fontSize: 12, cursor: "pointer",
          }}>
          🔊 Listen
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Progress bar */}
          <div style={{
            width: 80, height: 4, background: t.border,
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              width: `${progress}%`, height: "100%",
              background: "#1e3a5f", borderRadius: 2,
              transition: "width 0.2s",
            }} />
          </div>

          {paused ? (
            <button onClick={resume} title="Resume"
              style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.border}`,
                background: t.bg2, color: t.text2, fontSize: 11, cursor: "pointer" }}>
              ▶
            </button>
          ) : (
            <button onClick={pause} title="Pause"
              style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.border}`,
                background: t.bg2, color: t.text2, fontSize: 11, cursor: "pointer" }}>
              ⏸
            </button>
          )}
          <button onClick={stop} title="Stop"
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: t.bg2, color: t.text2, fontSize: 11, cursor: "pointer" }}>
            ⏹
          </button>

          {/* Speed selector */}
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
            style={{ padding: "3px 5px", borderRadius: 6, border: `1px solid ${t.border}`,
              background: t.bg2, color: t.text2, fontSize: 11, cursor: "pointer" }}>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </div>
      )}
    </div>
  );
}
