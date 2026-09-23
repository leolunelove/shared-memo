"use client";
import { useState } from "react";
import { LockKeyhole, ArrowRight, Mail } from "lucide-react";
export default function Login() {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="access-page">
      {sent ? <Mail size={27} /> : <LockKeyhole size={27} />}
      <h1>{sent ? "Check your inbox" : "Your private memo"}</h1>
      <p>
        {sent
          ? "If this is the owner’s email, a sign-in link is on its way. Open it here to continue."
          : "Sign in to make a little progress."}
      </p>
      {sent ? (
        <button className="back-link" onClick={() => setSent(false)}>
          Use a different email
        </button>
      ) : (
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              setSent(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="email">Owner email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="solid-button" disabled={busy}>
            {busy ? "Sending…" : "Send sign-in link"}
            <ArrowRight size={16} />
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <p>
        <small>Here to view? Open the private link shared with you.</small>
      </p>
    </main>
  );
}
