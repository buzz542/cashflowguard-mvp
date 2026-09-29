"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ReviewResults from "./ReviewResults";
import {
  ProfileMenu,
  withEntitlements,
  isProEmail,
  PRO_ACCOUNTS,
  type User
} from "./ProfileMenu";
import { hashPassword, verifyPassword } from "@/lib/password";

export default function HomePage() {
  const [view, setView] = useState<"marketing" | "app">("marketing");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [step, setStep] = useState<"landing" | "context" | "upload" | "loading" | "results">(
    "landing"
  );
  const [context, setContext] = useState({
    trade: "",
    projectSize: "",
    duration: "",
    role: ""
  });
  const [contractText, setContractText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("gc_user");
      if (s) {
        const raw = JSON.parse(s) as User & { password?: string };
        if (raw.password && !raw.passwordHash) {
          delete (raw as { password?: string }).password;
        }
        const restored = withEntitlements(raw as User);
        setUser(restored);
        localStorage.setItem("gc_user", JSON.stringify(restored));
        localStorage.setItem("gc_user_" + restored.email, JSON.stringify(restored));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch(
          "/api/checkout/verify?session_id=" + encodeURIComponent(sessionId)
        );
        const data = await res.json();
        if (!res.ok || !data.paid) return;
        let base: User | null = null;
        try {
          const s = localStorage.getItem("gc_user");
          if (s) base = JSON.parse(s);
        } catch {
          /* ignore */
        }
        if (!base && data.customer_email) {
          const stored = localStorage.getItem(
            "gc_user_" + String(data.customer_email).toLowerCase()
          );
          if (stored) base = JSON.parse(stored);
        }
        if (!base) return;
        const upgraded = withEntitlements({ ...base, isPro: true, freeUsed: false });
        setUser(upgraded);
        localStorage.setItem("gc_user", JSON.stringify(upgraded));
        localStorage.setItem("gc_user_" + upgraded.email, JSON.stringify(upgraded));
        setView("app");
        setStep("landing");
        window.history.replaceState({}, "", window.location.pathname);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const saveUser = (u: User) => {
    const next = withEntitlements(u);
    setUser(next);
    localStorage.setItem("gc_user", JSON.stringify(next));
    localStorage.setItem("gc_user_" + next.email, JSON.stringify(next));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("gc_user");
    setView("marketing");
    setStep("landing");
  };

  const canRun = (u: User | null) => !!u && (u.isPro || !u.freeUsed);

  const startCheckoutWithEmail = async (checkoutEmail?: string) => {
    setCheckoutLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: checkoutEmail || user?.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Checkout failed");
      setCheckoutLoading(false);
      setShowSubscribe(true);
    }
  };

  const startCheckout = async () => {
    await startCheckoutWithEmail(user?.email);
  };

  const openBillingPortal = async () => {
    if (!user?.email) return;
    setPortalLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing");
      if (data.url) window.location.href = data.url;
      else throw new Error("No portal URL");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not open billing portal");
      setPortalLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!email.includes("@") || password.length < 8) {
      setAuthError("Valid email and password (min 8 characters) required.");
      return;
    }
    const normalised = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password, normalised);

    if (authMode === "signup") {
      if (localStorage.getItem("gc_user_" + normalised)) {
        setAuthError("Account exists. Please log in.");
        return;
      }
      const u: User = {
        email: normalised,
        passwordHash,
        freeUsed: false,
        isPro: isProEmail(normalised),
        name: PRO_ACCOUNTS[normalised] || normalised.split("@")[0]
      };
      saveUser(u);
    } else {
      const stored = localStorage.getItem("gc_user_" + normalised);
      if (!stored) {
        if (isProEmail(normalised)) {
          saveUser({
            email: normalised,
            passwordHash,
            freeUsed: false,
            isPro: true,
            name: PRO_ACCOUNTS[normalised]
          });
        } else {
          setAuthError("No account found. Please sign up.");
          return;
        }
      } else {
        const u = JSON.parse(stored) as User & { password?: string };
        let ok = false;
        if (u.passwordHash) {
          ok = await verifyPassword(password, normalised, u.passwordHash);
        } else if (u.password) {
          ok = u.password === password;
        }
        if (!ok && !isProEmail(normalised)) {
          setAuthError("Incorrect password.");
          return;
        }
        const next: User = {
          email: normalised,
          passwordHash,
          freeUsed: !!u.freeUsed,
          isPro: isProEmail(normalised) ? true : !!u.isPro,
          name: PRO_ACCOUNTS[normalised] || u.name || normalised.split("@")[0]
        };
        saveUser(next);
      }
    }
    setAuthMode(null);
    setPassword("");
    if (pendingCheckout) {
      setPendingCheckout(false);
      setTimeout(() => {
        void startCheckoutWithEmail(normalised);
      }, 50);
      return;
    }
    setView("app");
    setStep("landing");
  };

  const goPro = () => {
    if (user?.isPro) {
      setView("app");
      setStep("landing");
      return;
    }
    if (!user) {
      setPendingCheckout(true);
      setAuthMode("signup");
      return;
    }
    void startCheckout();
  };

  const startCheck = () => {
    if (!user) {
      setAuthMode("signup");
      return;
    }
    if (!canRun(user)) {
      setShowSubscribe(true);
      return;
    }
    setContractText("");
    setPages([]);
    setError("");
    setView("app");
    setStep("context");
  };

  const processFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setExtracting(true);
    setError("");
    let combined = contractText;
    const names = [...pages];
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not read file");
        const text = (data.text || "").trim();
        if (!text) continue;
        const label = data.fileName || file.name;
        combined = combined ? combined + "\n\n--- " + label + " ---\n\n" + text : text;
        names.push(label);
      }
      setContractText(combined);
      setPages(names);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setExtracting(false);
      if (photoRef.current) photoRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Add a photo, PDF, Word file, or paste text.");
      return;
    }
    if (!user || !canRun(user)) {
      setShowSubscribe(true);
      return;
    }
    setStep("loading");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          contractText,
          email: user.email
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      if (!user.isPro) saveUser({ ...user, freeUsed: true });
      if (data.isPro && !user.isPro) {
        saveUser({ ...user, isPro: true, freeUsed: false });
      }
      setResult(data.result);
      setStep("results");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("upload");
    }
  };

  const FooterLinks = () => (
    <footer className="border-t py-6 text-center text-xs text-gray-500 space-y-2">
      <p>GuardConstruct · Not legal advice · Automated AI summaries only</p>
      <p className="space-x-3">
        <Link href="/privacy" className="text-blue-600 hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="text-blue-600 hover:underline">
          Terms
        </Link>
        <a href="mailto:tobyburrows1@icloud.com" className="text-blue-600 hover:underline">
          Report a problem
        </a>
      </p>
    </footer>
  );

  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">
            {pendingCheckout
              ? authMode === "signup"
                ? "Create account to get Pro"
                : "Log in to get Pro"
              : authMode === "signup"
                ? "Create account"
                : "Log in"}
          </h1>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="w-full rounded-lg border px-3 py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              placeholder="Password (min 8 characters)"
              className="w-full rounded-lg border px-3 py-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl"
            >
              {pendingCheckout
                ? authMode === "signup"
                  ? "Create account & continue to Stripe"
                  : "Log in & continue to Stripe"
                : authMode === "signup"
                  ? "Create account"
                  : "Log in"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-500">
            {authMode === "signup" ? (
              <>
                Have an account?{" "}
                <button type="button" className="text-blue-600" onClick={() => setAuthMode("login")}>
                  Log in
                </button>
              </>
            ) : (
              <>
                New?{" "}
                <button
                  type="button"
                  className="text-blue-600"
                  onClick={() => setAuthMode("signup")}
                >
                  Sign up
                </button>
              </>
            )}
          </p>
          <button
            type="button"
            className="text-xs text-gray-400 w-full"
            onClick={() => {
              setAuthMode(null);
              setPendingCheckout(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">Upgrade to Pro</h1>
          <p className="text-sm text-gray-600 text-center">
            Pro is £19/month for unlimited checks. Cancel any time in Manage billing.
          </p>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <button
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl"
            disabled={checkoutLoading}
            onClick={startCheckout}
          >
            {checkoutLoading ? "Opening Stripe…" : "Subscribe — £19/month"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-gray-500"
            onClick={() => setShowSubscribe(false)}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  if (view === "marketing") {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="GuardConstruct logo" className="h-8 w-auto" />
              <span className="font-bold hidden sm:inline">
                Guard<span className="text-blue-600">Construct</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <ProfileMenu
                  user={user}
                  onLogout={logout}
                  onManageBilling={user.isPro ? openBillingPortal : undefined}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="text-sm text-gray-600"
                >
                  Log in
                </button>
              )}
              <button
                type="button"
                onClick={startCheck}
                className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                Check a document
              </button>
            </div>
          </div>
        </header>
        <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase mb-5">
            Cash flow protection
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
            Before you sign it, know what it means.
          </h1>
          <p className="mt-6 text-lg text-gray-600">
            Photograph or upload a construction contract. Plain-English payment risks under English
            law. Automated AI summary — not legal advice.
          </p>
          <button
            type="button"
            onClick={startCheck}
            className="mt-8 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl"
          >
            Check a document — free first pass
          </button>
          <p className="mt-4 text-xs text-gray-500">
            UK subcontractors under 25 staff. Not legal advice.
          </p>
        </section>
        <section className="bg-white border-y py-12">
          <div className="max-w-3xl mx-auto px-4 grid sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border p-6">
              <p className="text-sm font-semibold text-gray-500 uppercase">Free</p>
              <p className="text-3xl font-bold mt-1">£0</p>
              <p className="text-sm text-gray-600 mt-1 mb-3">One document check</p>
              <button
                type="button"
                onClick={startCheck}
                className="w-full border font-semibold py-2.5 rounded-xl"
              >
                Start free check
              </button>
            </div>
            <div className="rounded-2xl border-2 border-blue-600 p-6">
              <p className="text-sm font-semibold text-gray-500 uppercase">Pro</p>
              <p className="text-3xl font-bold mt-1">
                £19<span className="text-base text-gray-500">/month</span>
              </p>
              <p className="text-sm text-gray-600 mt-1 mb-3">
                Unlimited checks · Cancel any time
              </p>
              <button
                type="button"
                onClick={goPro}
                disabled={checkoutLoading}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
              >
                {checkoutLoading
                  ? "Opening Stripe…"
                  : user?.isPro
                    ? "You’re on Pro"
                    : "Get Pro — £19/month"}
              </button>
            </div>
          </div>
        </section>
        <FooterLinks />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setView("marketing");
              setStep("landing");
            }}
            className="flex items-center gap-2"
          >
            <img src="/logo.svg" alt="GuardConstruct logo" className="h-7 w-auto" />
            <span className="font-bold hidden sm:inline">
              Guard<span className="text-blue-600">Construct</span>
            </span>
          </button>
          {user && (
            <ProfileMenu
              user={user}
              onLogout={logout}
              onManageBilling={user.isPro || portalLoading ? openBillingPortal : undefined}
            />
          )}
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {step === "landing" && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <h1 className="text-2xl font-bold">Check a document</h1>
            <button
              type="button"
              onClick={startCheck}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl"
            >
              Start a new check →
            </button>
          </div>
        )}
        {step === "context" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("upload");
            }}
            className="bg-white rounded-2xl border p-5 space-y-4"
          >
            <h1 className="text-2xl font-bold">About this job</h1>
            <input
              required
              placeholder="Trade / work"
              className="w-full rounded-lg border px-3 py-2.5"
              value={context.trade}
              onChange={(e) => setContext({ ...context, trade: e.target.value })}
            />
            <select
              required
              className="w-full rounded-lg border px-3 py-2.5"
              value={context.projectSize}
              onChange={(e) => setContext({ ...context, projectSize: e.target.value })}
            >
              <option value="">Package size</option>
              <option value="Under £10k">Under £10,000</option>
              <option value="£10k–£50k">£10,000 – £50,000</option>
              <option value="£50k–£250k">£50,000 – £250,000</option>
              <option value="£250k+">£250,000+</option>
            </select>
            <select
              required
              className="w-full rounded-lg border px-3 py-2.5"
              value={context.duration}
              onChange={(e) => setContext({ ...context, duration: e.target.value })}
            >
              <option value="">Duration</option>
              <option value="Under 1 month">Under 1 month</option>
              <option value="1–3 months">1–3 months</option>
              <option value="3–6 months">3–6 months</option>
              <option value="6+ months">6+ months</option>
            </select>
            <select
              required
              className="w-full rounded-lg border px-3 py-2.5"
              value={context.role}
              onChange={(e) => setContext({ ...context, role: e.target.value })}
            >
              <option value="">Your role</option>
              <option value="Subcontractor">Subcontractor</option>
              <option value="Sub-subcontractor">Sub-subcontractor</option>
              <option value="Direct to client">Direct to client</option>
              <option value="Freelance / labour-only">Freelance / labour-only</option>
            </select>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl"
            >
              Continue →
            </button>
          </form>
        )}
        {step === "upload" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <h1 className="text-2xl font-bold">Add the document</h1>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => processFiles(e.target.files)}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,image/*"
              className="hidden"
              onChange={(e) => processFiles(e.target.files)}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={extracting}
                onClick={() => photoRef.current?.click()}
                className="border-2 border-dashed rounded-xl py-5 text-sm font-medium"
              >
                {extracting ? "Reading…" : "📷 Take photo"}
              </button>
              <button
                type="button"
                disabled={extracting}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-xl py-5 text-sm font-medium"
              >
                {extracting ? "Reading…" : "📄 Upload PDF / Word"}
              </button>
            </div>
            {pages.length > 0 && (
              <ul className="text-sm space-y-1">
                {pages.map((p, i) => (
                  <li key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                    {i + 1}. {p}
                  </li>
                ))}
              </ul>
            )}
            <textarea
              rows={4}
              placeholder="Or paste contract text…"
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={runReview}
              disabled={extracting || !contractText.trim()}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50"
            >
              Run check →
            </button>
          </div>
        )}
        {step === "loading" && (
          <div className="text-center py-16">
            <div className="text-3xl animate-pulse">⏳</div>
            <h1 className="text-xl font-bold mt-4">Building your action plan…</h1>
            <p className="text-sm text-gray-500 mt-2">Automated AI summary — not legal advice</p>
          </div>
        )}
        {step === "results" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Your action plan</h1>
              <button
                type="button"
                className="text-sm text-blue-600"
                onClick={() => setStep("landing")}
              >
                Done
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
              <p className="font-bold text-red-900">Not legal advice</p>
              <p className="text-red-800">
                Commercial risk identification only. Generated by AI — may be incomplete or wrong.
              </p>
            </div>
            <div className="bg-white rounded-2xl border p-5">
              <ReviewResults result={result} />
            </div>
            <button
              type="button"
              onClick={startCheck}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl"
            >
              Start another check →
            </button>
          </div>
        )}
      </main>
      <FooterLinks />
    </div>
  );
}
