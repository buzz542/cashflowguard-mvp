"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export function AuthModal({
  mode,
  setMode,
  termsVersion,
  forCheckout,
  onDone,
  onCancel
}: {
  mode: "login" | "signup";
  setMode: (m: "login" | "signup") => void;
  termsVersion: string;
  forCheckout: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const supabase = getSupabaseBrowser();
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  const reset = () => {
    setError("");
    setNotice("");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (!supabase) return setError("Accounts are not set up on this site yet.");
    if (mode === "signup" && !agreed) return setError("Please accept the Terms to create an account.");
    if (mode === "signup" && !termsVersion) return setError("Still loading. Please try again in a moment.");
    setBusy(true);
    try {
      const normalised = email.trim().toLowerCase();
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: normalised,
          password,
          options: { emailRedirectTo: redirectTo, data: { terms_version: termsVersion } }
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then come back and log in.");
          return;
        }
        onDone();
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: normalised, password });
        if (err) throw err;
        onDone();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(/not confirmed/i.test(msg) ? "Please confirm your email first. Check your inbox for the link." : msg);
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    reset();
    if (!supabase) return setError("Accounts are not set up on this site yet.");
    if (!email.includes("@")) return setError("Enter your email address first.");
    if (mode === "signup" && !agreed) return setError("Please accept the Terms to create an account.");
    if (agreed && !termsVersion) return setError("Still loading. Please try again in a moment.");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
          data: agreed ? { terms_version: termsVersion } : undefined
        }
      });
      if (err) throw err;
      setNotice("We've emailed you a login link. Open it on this device.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  };

  const title = forCheckout
    ? mode === "signup" ? "Create account to get Pro" : "Log in to get Pro"
    : mode === "signup" ? "Create account" : "Log in";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
      <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">{title}</h1>
        <form onSubmit={submitPassword} className="space-y-3">
          <input type="email" required autoComplete="email" placeholder="Email"
            className="w-full rounded-lg border px-3 py-2.5" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password (min 8 characters)"
            className="w-full rounded-lg border px-3 py-2.5" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {mode === "signup" && (
            <label className="flex gap-2 items-start text-xs text-gray-600">
              <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I agree to the <Link href="/terms" target="_blank" className="text-blue-600 underline">Terms</Link> and
                have read the <Link href="/privacy" target="_blank" className="text-blue-600 underline">Privacy Policy</Link>.
                I understand GuardConstruct gives automated summaries, <strong>not legal advice</strong>.
              </span>
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}
          <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60">
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
        <button type="button" disabled={busy} onClick={sendLink} className="w-full border font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">
          Email me a login link instead
        </button>
        <p className="text-xs text-center text-gray-500">
          {mode === "signup" ? (
            <>Have an account? <button type="button" className="text-blue-600" onClick={() => { reset(); setMode("login"); }}>Log in</button></>
          ) : (
            <>New? <button type="button" className="text-blue-600" onClick={() => { reset(); setMode("signup"); }}>Sign up</button></>
          )}
        </p>
        <button type="button" className="text-xs text-gray-400 w-full" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function TermsGate({
  termsVersion,
  onAccepted,
  onCancel
}: {
  termsVersion: string;
  onAccepted: () => void;
  onCancel: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/me/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: termsVersion })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      onAccepted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
      <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">Before you check a contract</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900">
          <p className="font-bold">Not legal advice</p>
          <p className="mt-1">
            GuardConstruct produces automated AI summaries of commercial risk. They may be incomplete or wrong.
            It is not a law firm and doesn&apos;t replace a solicitor or qualified adviser.
          </p>
        </div>
        <label className="flex gap-2 items-start text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I understand this and agree to the <Link href="/terms" target="_blank" className="text-blue-600 underline">Terms</Link>{" "}
            and <Link href="/privacy" target="_blank" className="text-blue-600 underline">Privacy Policy</Link>.
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" disabled={!agreed || busy} onClick={accept}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
          {busy ? "Saving…" : "Continue"}
        </button>
        <button type="button" className="w-full text-sm text-gray-500" onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}
