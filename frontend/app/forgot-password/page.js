"use client";
// app/forgot-password/page.js — NEW FILE (was missing → 404 on "Forgot password?" click)

import { useState } from "react";
import { AuthLayout, Field, ErrorBox, SubmitButton } from "../../components/auth/AuthUI";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);

    if (!supabase) {
      setError("Password reset is unavailable right now. Please contact support.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) {
        setError(error.message);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a password reset link to ${email}`}>
        <div style={{
          textAlign: "center", padding: "1rem",
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 10, color: "#166534", fontSize: 14, lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
          <strong>Reset link sent!</strong>
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>
            Click the link in your email to set a new password. The link expires in 1 hour.
          </p>
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: "#64748b", marginTop: 16 }}>
          Didn't receive it?{" "}
          <button onClick={() => setSent(false)}
            style={{ background: "none", border: "none", color: "#1e3a5f", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            Try again
          </button>
        </p>
        <p style={{ textAlign: "center", marginTop: 8 }}>
          <a href="/login" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>
            ← Back to sign in
          </a>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link">

      <form onSubmit={handleSubmit}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>

      <p style={{ textAlign: "center", fontSize: 13, color: "#64748b", marginTop: 16 }}>
        <a href="/login" style={{ color: "#1e3a5f", textDecoration: "none", fontWeight: 500 }}>
          ← Back to sign in
        </a>
      </p>
    </AuthLayout>
  );
}
