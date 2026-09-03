"use client";
// app/signup/page.js

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  signUpWithEmail, signInWithGoogle, getSession
} from "../../lib/supabase";
import {
  AuthLayout, OAuthButton, GoogleIcon, Divider,
  Field, ErrorBox, SubmitButton, LoadingScreen
} from "../../components/auth/AuthUI";

const PROFESSIONS = [
  { key:"general",     label:"General reader",     icon:"📰" },
  { key:"upsc",        label:"Civil Services (UPSC/IAS)", icon:"🏛️" },
  { key:"medical",     label:"Medical (MBBS/PG)",   icon:"🩺" },
  { key:"law",         label:"Law (LLB/Bar)",        icon:"⚖️" },
  { key:"technology",  label:"Technology",           icon:"💻" },
  { key:"finance",     label:"Finance & Business",   icon:"📈" },
  { key:"student",     label:"Student (GK/Boards)",  icon:"🎓" },
  { key:"environment", label:"Environment",          icon:"🌱" },
  { key:"defence",     label:"Defence",              icon:"🛡️" },
  { key:"research",    label:"Research / Academia",  icon:"🔬" },
];

function SignupPageContent() {
  const searchParams = useSearchParams();
  const nextParamRaw = searchParams.get("next") || "/";
  const nextParam = nextParamRaw.startsWith("/") && !nextParamRaw.startsWith("//") ? nextParamRaw : "/";
  const [step,       setStep]       = useState(1); // 1=email, 2=profession
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [profession, setProfession] = useState("general");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [checking,   setChecking]   = useState(true);

  useEffect(() => {
    getSession().then(session => {
      if (session) window.location.href = nextParam;
      else setChecking(false);
    });
  }, [nextParam]);

  const handleStep1 = (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setStep(2);
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await signUpWithEmail(email, password);
    if (error) { setError(error.message); setLoading(false); }
    else {
      // Save profession preference locally until email is confirmed
      localStorage.setItem("dhara_pending_profession", profession);
      setDone(true);
    }
  };

  const handleGoogle = async () => {
    setError(""); setLoading(true);
    const { error } = await signInWithGoogle(nextParam);
    if (error) { setError(error.message); setLoading(false); }
  };

  if (checking) return <LoadingScreen />;

  if (done) {
    return (
      <AuthLayout title="Check your email" subtitle="">
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 0 }}>
            We sent a confirmation link to<br />
            <strong>{email}</strong>
          </p>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>
            Click the link in the email to activate your account.
            Then come back and sign in.
          </p>
          <a href="/login"
            style={{ display: "inline-block", marginTop: 20, padding: "10px 24px",
              background: "#1e3a5f", color: "#fff", borderRadius: 10,
              textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            Go to sign in
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={step === 1 ? "Create your account" : "What describes you best?"}
      subtitle={step === 1 ? "Free forever · No credit card" : "Your feed will be tailored to your professional needs"}>

      {step === 1 && (
        <>
          <OAuthButton onClick={handleGoogle} loading={loading}>
            <GoogleIcon />
            Sign up with Google
          </OAuthButton>
          <Divider />
          <form onSubmit={handleStep1}>
            <Field label="Email" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required />
            <Field label="Password" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters" required />
            <Field label="Confirm password" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required />
            {error && <ErrorBox>{error}</ErrorBox>}
            <SubmitButton loading={false}>Continue</SubmitButton>
          </form>
          <p style={{ textAlign: "center", fontSize: 13, color: "#64748b", marginTop: 20 }}>
            Already have an account?{" "}
            <a href={`/login?next=${encodeURIComponent(nextParam)}`} style={{ color: "#1e3a5f", fontWeight: 600, textDecoration: "none" }}>
              Sign in
            </a>
          </p>
        </>
      )}

      {step === 2 && (
        <form onSubmit={handleStep2}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {PROFESSIONS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProfession(p.key)}
                style={{ display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px", borderRadius: 10, border: "1.5px solid",
                  borderColor: profession === p.key ? "#1e3a5f" : "#e2e8f0",
                  background:  profession === p.key ? "#eff6ff" : "#fff",
                  cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ fontSize: 12, fontWeight: profession === p.key ? 600 : 400,
                  color: profession === p.key ? "#1e3a5f" : "#374151", lineHeight: 1.3 }}>
                  {p.label}
                </span>
              </button>
            ))}
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <SubmitButton loading={loading}>Create account</SubmitButton>

          <button type="button" onClick={() => setStep(1)}
            style={{ width: "100%", marginTop: 10, padding: "10px",
              background: "transparent", border: "none",
              fontSize: 13, color: "#64748b", cursor: "pointer" }}>
            ← Back
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SignupPageContent />
    </Suspense>
  );
}
