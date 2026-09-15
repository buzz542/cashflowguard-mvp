"use client";

import { useState, useEffect, useRef } from "react";

type Review = {
  id: string;
  date: string;
  trade: string;
  projectSize: string;
  result: string;
  contractPreview: string;
};

type User = {
  email: string;
  password: string;
  freeUsed: boolean;
  verified: boolean;
  isPro?: boolean;
  verifyCode?: string;
};

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function HomePage() {
  const [view, setView] = useState<"marketing" | "app">("marketing");
  const [tab, setTab] = useState<"home" | "reviews" | "about">("home");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [verifyCodeInput, setVerifyCodeInput] = useState("");
  const [devCode, setDevCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMsg, setCheckoutMsg] = useState("");

  const [step, setStep] = useState<"landing" | "context" | "upload" | "loading" | "results">("landing");
  const [context, setContext] = useState({
    trade: "",
    projectSize: "",
    duration: "",
    role: "",
    extra: ""
  });
  const [contractText, setContractText] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [fileName, setFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("gc_user");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser) as User;
        if (u.verified === undefined) u.verified = true;
        setUser(u);
        // Pro users land in the app, not the free marketing page
        if (u.verified && u.isPro) {
          setView("app");
          setTab("home");
          setStep("landing");
        }
      } catch {}
    }
    const savedReviews = localStorage.getItem("gc_reviews");
    if (savedReviews) {
      try { setReviews(JSON.parse(savedReviews)); } catch {}
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get("checkout");
      const sessionId = params.get("session_id");
      if (checkout === "success" && sessionId) {
        (async () => {
          try {
            const res = await fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
            const data = await res.json();
            if (data.paid) {
              const current = localStorage.getItem("gc_user");
              if (current) {
                const u = JSON.parse(current) as User;
                u.isPro = true;
                localStorage.setItem("gc_user", JSON.stringify(u));
                localStorage.setItem("gc_user_" + u.email, JSON.stringify(u));
                setUser(u);
                setView("app");
                setTab("home");
                setStep("landing");
                setCheckoutMsg("Pro unlocked. You can run unlimited checks.");
              } else {
                setCheckoutMsg("Payment received. Log in with the same email to unlock Pro.");
              }
            }
          } catch {
            setCheckoutMsg("Payment received. If Pro is not unlocked, log out and log in again.");
          }
          window.history.replaceState({}, "", "/");
        })();
      } else if (checkout === "cancel") {
        setCheckoutMsg("Checkout cancelled.");
        window.history.replaceState({}, "", "/");
      }
    }
  }, []);

  const saveUser = (u: User) => {
    setUser(u);
    localStorage.setItem("gc_user", JSON.stringify(u));
    localStorage.setItem("gc_user_" + u.email, JSON.stringify(u));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("gc_user");
    setShowProfile(false);
    setView("marketing");
    setStep("landing");
  };

  const saveReview = (r: Review) => {
    const updated = [r, ...reviews].slice(0, 20);
    setReviews(updated);
    localStorage.setItem("gc_reviews", JSON.stringify(updated));
  };

  const canRunCheck = (u: User | null) => {
    if (!u || !u.verified) return false;
    if (u.isPro) return true;
    return !u.freeUsed;
  };

  const startCheckout = async () => {
    setCheckoutLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (err: any) {
      setAuthError(err.message || "Could not start checkout");
      setCheckoutLoading(false);
    }
  };

  const startVerifyFlow = (u: User, code: string) => {
    setPendingEmail(u.email);
    setDevCode(code);
    setVerifyCodeInput("");
    setAuthMode(null);
    setShowVerify(true);
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!email.includes("@") || password.length < 6) {
      setAuthError("Please enter a valid email and a password of at least 6 characters.");
      return;
    }

    if (authMode === "signup") {
      const existing = localStorage.getItem("gc_user_" + email.toLowerCase());
      if (existing) {
        setAuthError("An account with this email already exists. Please log in.");
        return;
      }
      const code = makeCode();
      const newUser: User = {
        email: email.toLowerCase(),
        password,
        freeUsed: false,
        verified: false,
        isPro: false,
        verifyCode: code
      };
      localStorage.setItem("gc_user_" + email.toLowerCase(), JSON.stringify(newUser));
      startVerifyFlow(newUser, code);
    } else {
      const stored = localStorage.getItem("gc_user_" + email.toLowerCase());
      if (!stored) {
        setAuthError("No account found. Please sign up.");
        return;
      }
      const u: User = JSON.parse(stored);
      if (u.password !== password) {
        setAuthError("Incorrect password.");
        return;
      }
      if (!u.verified) {
        const code = u.verifyCode || makeCode();
        u.verifyCode = code;
        localStorage.setItem("gc_user_" + u.email, JSON.stringify(u));
        startVerifyFlow(u, code);
        return;
      }
      saveUser(u);
      setAuthMode(null);
      setView("app");
      setTab("home");
      setStep(u.isPro || !u.freeUsed ? "landing" : "landing");
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const stored = localStorage.getItem("gc_user_" + pendingEmail);
    if (!stored) {
      setAuthError("Account not found. Please sign up again.");
      return;
    }
    const u: User = JSON.parse(stored);
    if (verifyCodeInput.trim() !== u.verifyCode) {
      setAuthError("Incorrect code. Please try again.");
      return;
    }
    u.verified = true;
    u.verifyCode = undefined;
    saveUser(u);
    setShowVerify(false);
    setDevCode("");
    setView("app");
    setStep("landing");
  };

  const startCheck = () => {
    if (!user) {
      setAuthMode("signup");
      return;
    }
    if (!user.verified) {
      const code = user.verifyCode || makeCode();
      user.verifyCode = code;
      localStorage.setItem("gc_user_" + user.email, JSON.stringify(user));
      startVerifyFlow(user, code);
      return;
    }
    if (!canRunCheck(user)) {
      setShowSubscribe(true);
      return;
    }
    setView("app");
    setTab("home");
    setStep("context");
  };

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("upload");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read this file");
      setContractText(data.text || "");
      setFileName(data.fileName || file.name);
    } catch (err: any) {
      setError(err.message || "Could not read this file. Try pasting the text instead.");
      setFileName("");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Please upload a .docx / .txt file or paste the contract text.");
      return;
    }
    if (!user || !user.verified) return;
    if (!canRunCheck(user)) {
      setShowSubscribe(true);
      return;
    }
    setStep("loading");
    setError("");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, contractText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      if (!user.isPro) {
        saveUser({ ...user, freeUsed: true });
      }
      setResult(data.result);
      saveReview({
        id: Date.now().toString(),
        date: new Date().toLocaleDateString("en-GB"),
        trade: context.trade,
        projectSize: context.projectSize,
        result: data.result,
        contractPreview: contractText.slice(0, 120) + "..."
      });
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setStep("upload");
    }
  };

  const formatResult = (text: string) => {
    let cleaned = text
      .replace(/^IMPORTANT DISCLAIMER[\s\S]*?(?=Project context used|Risk Register|\*\*Project context|$)/i, "")
      .trim();
    const lines = cleaned.split("\n");
    let html = "";
    let inBlockquote = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.startsWith("### ")) {
        if (inBlockquote) { html += "</blockquote>"; inBlockquote = false; }
        const title = line.replace(/^###\s*/, "").replace(/\*\*/g, "");
        html += `<h3 class="text-base font-semibold mt-6 mb-2 text-gray-900 border-b border-gray-100 pb-1">${title}</h3>`;
        continue;
      }
      if (line.startsWith("## ")) {
        if (inBlockquote) { html += "</blockquote>"; inBlockquote = false; }
        const title = line.replace(/^##\s*/, "").replace(/\*\*/g, "");
        html += `<h2 class="text-lg font-bold mt-8 mb-3 text-gray-900">${title}</h2>`;
        continue;
      }
      if (line.startsWith("> ") || line.startsWith(">")) {
        const content = line.replace(/^>\s*/, "");
        if (!inBlockquote) {
          html += `<blockquote class="border-l-4 border-blue-600 bg-blue-50/80 pl-3 pr-2 py-2 my-2 text-sm rounded-r-lg">`;
          inBlockquote = true;
        }
        html += `<p class="mb-1">${content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
        continue;
      } else if (inBlockquote) {
        html += "</blockquote>";
        inBlockquote = false;
      }
      if (line.trim() === "---" || line.trim() === "") {
        html += `<div class="h-2"></div>`;
        continue;
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        html += `<p class="font-semibold mt-3 mb-1">${line.replace(/\*\*/g, "")}</p>`;
        continue;
      }
      const withBold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<p class="mb-2 text-sm leading-relaxed text-gray-700">${withBold}</p>`;
    }
    if (inBlockquote) html += "</blockquote>";
    return html;
  };

  const ProfileButton = () => {
    if (!user || !user.verified) return null;
    return (
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
          className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center"
          aria-label="Account"
        >
          {user.email.charAt(0).toUpperCase()}
        </button>
        {showProfile && (
          <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-gray-500">Signed in as</p>
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              {user.isPro ? "Pro plan · unlimited checks" : user.freeUsed ? "Free check used" : "Free check available"}
            </p>
            {!user.isPro && (
              <button
                onClick={() => { setShowProfile(false); setShowSubscribe(true); }}
                className="mt-2 w-full text-left text-sm text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1.5"
              >
                Upgrade to Pro
              </button>
            )}
            <button onClick={logout} className="mt-1 w-full text-left text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5">
              Log out
            </button>
          </div>
        )}
      </div>
    );
  };

  if (showVerify) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">Verify your email</h1>
          <p className="text-sm text-gray-600 text-center">
            Enter the 6-digit code for<br />
            <span className="font-medium text-gray-900">{pendingEmail}</span>
          </p>
          {devCode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-xs text-amber-800">Testing mode — your code is:</p>
              <p className="text-2xl font-bold tracking-widest text-amber-900 mt-1">{devCode}</p>
            </div>
          )}
          <form onSubmit={handleVerify} className="space-y-3">
            <input type="text" inputMode="numeric" maxLength={6} required placeholder="6-digit code"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-widest"
              value={verifyCodeInput} onChange={(e) => setVerifyCodeInput(e.target.value.replace(/\D/g, ""))} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">Verify & continue</button>
          </form>
          <button className="text-xs text-gray-400 w-full text-center" onClick={() => { setShowVerify(false); setAuthMode("login"); setDevCode(""); }}>Back to login</button>
        </div>
      </div>
    );
  }

  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">{authMode === "signup" ? "Create your free account" : "Log in"}</h1>
          <p className="text-sm text-gray-600 text-center">First document check is free. No card needed.</p>
          <form onSubmit={handleAuth} className="space-y-3">
            <input type="email" required placeholder="Email" className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="Password (min 6 characters)" className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={password} onChange={(e) => setPassword(e.target.value)} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">{authMode === "signup" ? "Create account" : "Log in"}</button>
          </form>
          <p className="text-xs text-center text-gray-500">
            {authMode === "signup" ? (
              <>Already have an account? <button className="text-blue-600" onClick={() => setAuthMode("login")}>Log in</button></>
            ) : (
              <>New here? <button className="text-blue-600" onClick={() => setAuthMode("signup")}>Sign up</button></>
            )}
          </p>
          <button className="text-xs text-gray-400 w-full text-center" onClick={() => setAuthMode(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border shadow-lg p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">You’ve used your free check</h1>
          <p className="text-sm text-gray-600 text-center">Unlock unlimited checks with Pro.</p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold">GuardConstruct Pro – £19 / month</p>
            <p>• Unlimited document checks</p>
            <p>• Saved history of every job</p>
            <p>• Cancel anytime</p>
          </div>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <button className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60" disabled={checkoutLoading} onClick={startCheckout}>
            {checkoutLoading ? "Opening Stripe…" : "Subscribe with Stripe"}
          </button>
          <button className="w-full text-sm text-gray-500" onClick={() => { setShowSubscribe(false); setView("marketing"); }}>Maybe later</button>
        </div>
      </div>
    );
  }

  // ========== PUBLIC MARKETING (not Pro) ==========
  if (view === "marketing") {
    return (
      <div className="min-h-screen flex flex-col" onClick={() => showProfile && setShowProfile(false)}>
        <header className="sticky top-0 z-20 bg-[#FAFAF9]/90 backdrop-blur border-b border-gray-200/80">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="font-bold text-lg tracking-tight">Guard<span className="text-blue-600">Construct</span></div>
            <div className="flex items-center gap-3">
              {user && user.verified ? <ProfileButton /> : (
                <button onClick={() => setAuthMode("login")} className="text-sm text-gray-600">Log in</button>
              )}
              <button onClick={startCheck} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                {user?.isPro ? "New check" : "Check a document"}
              </button>
            </div>
          </div>
        </header>
        <main>
          {checkoutMsg && (
            <div className="max-w-5xl mx-auto px-4 pt-4">
              <div className="bg-green-50 border border-green-200 text-green-900 text-sm rounded-xl px-4 py-3">{checkoutMsg}</div>
            </div>
          )}
          <section className="max-w-5xl mx-auto px-4 pt-12 pb-16 sm:pt-20">
            <div className="text-center max-w-2xl mx-auto">
              <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Built for UK contractors</p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">Before you sign it,<br />know what it means.</h1>
              <p className="mt-5 text-lg text-gray-600">Upload a contract or variation. Get a plain-English explanation — including anything that could affect your payment.</p>
              <button onClick={startCheck} className="mt-8 w-full sm:w-auto bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl">
                Check a document — Free
              </button>
              <p className="mt-3 text-sm text-gray-500">No credit card · Results in minutes</p>
            </div>
          </section>
          <section id="pricing" className="py-16 border-t">
            <div className="max-w-3xl mx-auto px-4 text-center">
              <h2 className="text-2xl font-bold">Try it before you pay.</h2>
              <div className="mt-10 grid sm:grid-cols-2 gap-4 text-left">
                <div className="rounded-2xl border-2 border-blue-600 p-6">
                  <p className="text-sm font-semibold text-blue-600">Free</p>
                  <p className="mt-1 text-3xl font-bold">£0</p>
                  <p className="text-sm text-gray-500">1 document check</p>
                  <button onClick={startCheck} className="mt-6 w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl">Check a document — Free</button>
                </div>
                <div className="rounded-2xl border border-gray-200 p-6">
                  <p className="text-sm font-semibold text-gray-500">Pro</p>
                  <p className="mt-1 text-3xl font-bold">£19<span className="text-base font-normal text-gray-500">/month</span></p>
                  <p className="text-sm text-gray-500">Unlimited checks</p>
                  <button onClick={() => { if (!user) setAuthMode("signup"); else setShowSubscribe(true); }} className="mt-6 w-full border border-gray-300 font-semibold py-2.5 rounded-xl">Subscribe</button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <footer className="border-t py-8 text-center text-xs text-gray-500">Commercial risk identification only. Not legal advice.</footer>
      </div>
    );
  }

  // ========== LOGGED-IN APP (incl. Pro dashboard) ==========
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]" onClick={() => showProfile && setShowProfile(false)}>
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => { setTab("home"); setStep("landing"); }} className="font-bold text-lg">
            Guard<span className="text-blue-600">Construct</span>
          </button>
          <div className="flex items-center gap-2">
            {user?.isPro && (
              <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Pro</span>
            )}
            <ProfileButton />
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-6 text-sm border-t">
          <button onClick={() => { setTab("home"); setStep("landing"); }} className={`py-2.5 border-b-2 ${tab === "home" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>Home</button>
          <button onClick={() => setTab("reviews")} className={`py-2.5 border-b-2 ${tab === "reviews" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>My Reviews</button>
          <button onClick={() => setTab("about")} className={`py-2.5 border-b-2 ${tab === "about" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>About</button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {checkoutMsg && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-900 text-sm rounded-xl px-4 py-3">{checkoutMsg}</div>
        )}

        {tab === "home" && (
          <>
            {step === "landing" && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border p-5 space-y-3">
                  <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
                    {user?.isPro ? "Your Pro account" : "Your account"}
                  </p>
                  <h1 className="text-2xl font-bold">
                    {user?.isPro ? "Ready for the next document?" : "Check a document"}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {user?.isPro
                      ? "Unlimited checks. Upload a contract, variation or site instruction."
                      : "First check is free."}
                  </p>
                  <button onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                    {user?.isPro ? "Start a new check →" : "Start check →"}
                  </button>
                </div>

                {reviews.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-gray-900">Recent checks</h2>
                      <button onClick={() => setTab("reviews")} className="text-sm text-blue-600">View all</button>
                    </div>
                    {reviews.slice(0, 3).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setResult(r.result);
                          setTab("home");
                          setStep("results");
                        }}
                        className="w-full text-left bg-white rounded-2xl border p-4 hover:border-blue-300 transition"
                      >
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{r.trade || "Document check"}</span>
                          <span className="text-gray-500">{r.date}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{r.projectSize}</p>
                        <p className="text-xs text-gray-400 mt-2 line-clamp-2">{r.contractPreview}</p>
                      </button>
                    ))}
                  </div>
                )}

                {reviews.length === 0 && user?.isPro && (
                  <p className="text-sm text-gray-500 text-center py-4">No checks yet. Run your first one above.</p>
                )}
              </div>
            )}

            {step === "context" && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">About this job</h1>
                <form onSubmit={handleContextSubmit} className="bg-white rounded-2xl border p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Trade / work</label>
                    <input required type="text" placeholder="e.g. Framing, Electrical" className="w-full rounded-lg border px-3 py-2.5" value={context.trade} onChange={(e) => setContext({ ...context, trade: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Package size</label>
                    <select required className="w-full rounded-lg border px-3 py-2.5" value={context.projectSize} onChange={(e) => setContext({ ...context, projectSize: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under £10k">Under £10,000</option>
                      <option value="£10k–£50k">£10,000 – £50,000</option>
                      <option value="£50k–£250k">£50,000 – £250,000</option>
                      <option value="£250k+">£250,000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Duration</label>
                    <select required className="w-full rounded-lg border px-3 py-2.5" value={context.duration} onChange={(e) => setContext({ ...context, duration: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under 1 month">Under 1 month</option>
                      <option value="1–3 months">1–3 months</option>
                      <option value="3–6 months">3–6 months</option>
                      <option value="6+ months">6+ months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Your role</label>
                    <select required className="w-full rounded-lg border px-3 py-2.5" value={context.role} onChange={(e) => setContext({ ...context, role: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Subcontractor">Subcontractor</option>
                      <option value="Sub-subcontractor">Sub-subcontractor</option>
                      <option value="Direct to client">Direct to client</option>
                      <option value="Freelance / labour-only">Freelance / labour-only</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Continue →</button>
                </form>
              </div>
            )}

            {step === "upload" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold">Add the document</h1>
                  <p className="text-gray-600 text-sm mt-1">Upload a Word file (.docx) or .txt, or paste the text.</p>
                </div>
                <div className="bg-white rounded-2xl border p-5 space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.txt,.md,.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-600 disabled:opacity-60"
                  >
                    {extracting ? "Reading file…" : fileName ? `Uploaded: ${fileName}` : "Upload Word (.docx) or text file"}
                  </button>
                  <p className="text-xs text-center text-gray-400">PDF and photos: paste the text for now</p>
                  <textarea
                    rows={10}
                    placeholder="Or paste the contract text here..."
                    className="w-full rounded-lg border px-3 py-2.5"
                    value={contractText}
                    onChange={(e) => { setContractText(e.target.value); setFileName(""); }}
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button onClick={runReview} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Run check →</button>
                </div>
              </div>
            )}

            {step === "loading" && (
              <div className="text-center py-16 space-y-4">
                <div className="text-3xl animate-pulse">⏳</div>
                <h1 className="text-xl font-bold">Checking the document...</h1>
              </div>
            )}

            {step === "results" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">What to check before signing</h1>
                  <button onClick={() => setStep("landing")} className="text-sm text-blue-600">Done</button>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
                  <p className="font-bold text-red-900">Not legal advice</p>
                  <p className="text-red-800 mt-1">Commercial risk identification only.</p>
                </div>
                <div className="bg-white rounded-2xl border p-5" dangerouslySetInnerHTML={{ __html: formatResult(result) }} />
                <button onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                  Start another check →
                </button>
              </div>
            )}
          </>
        )}

        {tab === "reviews" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">My Reviews</h1>
            {reviews.length === 0 && <p className="text-sm text-gray-600">No reviews yet. Run a check from Home.</p>}
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border p-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{r.trade} · {r.projectSize}</span>
                  <span className="text-gray-500">{r.date}</span>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600">View result</summary>
                  <div className="mt-3" dangerouslySetInnerHTML={{ __html: formatResult(r.result) }} />
                </details>
              </div>
            ))}
          </div>
        )}

        {tab === "about" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">About</h1>
            <div className="bg-white rounded-2xl border p-5 text-sm text-gray-700 space-y-2">
              <p>GuardConstruct helps small UK contractors understand construction paperwork before they sign.</p>
              <p className="text-gray-500">Commercial risk identification only. Not legal advice.</p>
              {user?.isPro && <p className="text-blue-700 font-medium">You are on the Pro plan.</p>}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t py-4 text-center text-xs text-gray-500">Commercial risk identification only. Not legal advice.</footer>
    </div>
  );
}
