"use client";
// app/login/page.js — forgot-password link now points to /forgot-password which exists

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  signInWithEmail, signInWithGoogle, getSession
} from "../../lib/supabase";
import {
  AuthLayout, OAuthButton, GoogleIcon, Divider,
  Field, ErrorBox, SubmitButton, LoadingScreen
} from "../../components/auth/AuthUI";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const nextParamRaw = searchParams.get("next") || "/";
  const nextParam = nextParamRaw.startsWith("/") && !nextParamRaw.startsWith("//") ? nextParamRaw : "/";
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession().then(session => {
      if (session) window.location.href = nextParam;
      else setChecking(false);
    });
  }, [nextParam]);

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await signInWithEmail(email, password);
    if (error) { setError(error.message); setLoading(false); }
    else window.location.href = nextParam;
  };

  const handleGoogle = async () => {
    setError(""); setLoading(true);
    const { error } = await signInWithGoogle(nextParam);
    if (error) { setError(error.message); setLoading(false); }
  };

  if (checking) return <LoadingScreen />;

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Dhara account">
      <OAuthButton onClick={handleGoogle} loading={loading}>
        <GoogleIcon />
        Continue with Google
      </OAuthButton>

      <Divider />

      <form onSubmit={handleEmail}>
        <Field label="Email" type="email" value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" required />

        <Field label="Password" type="password" value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••" required>
          {/* FIX: /forgot-password now exists */}
          <a href="/forgot-password"
            style={{ fontSize: 12, color: "#1e3a5f", textDecoration: "none", marginLeft: "auto" }}>
            Forgot password?
          </a>
        </Field>

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>

      <p style={{ textAlign: "center", fontSize: 13, color: "#64748b", marginTop: 20 }}>
        Don't have an account?{" "}
        <a href={`/signup?next=${encodeURIComponent(nextParam)}`} style={{ color: "#1e3a5f", fontWeight: 600, textDecoration: "none" }}>
          Sign up free
        </a>
      </p>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginPageContent />
    </Suspense>
  );
}
