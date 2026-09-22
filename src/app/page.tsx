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

type UploadedPage = {
  id: string;
  name: string;
  chars: number;
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
  const [context, setContext] = useState({ trade: "", projectSize: "", duration: "", role: "", extra: "" });
  const [contractText, setContractText] = useState("");
  const [uploadedPages, setUploadedPages] = useState<UploadedPage[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [extracting, setExtracting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("gc_user");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser) as User;
        if (u.verified === undefined) u.verified = true;
        setUser(u);
        if (u.verified && u.isPro) {
          setView("app");
          setTab("home");
          setStep("landing");
        }
      } catch {}
    }
    const savedReviews = localStorage.getItem("gc_reviews");
    if (savedReviews) {
      try {
        setReviews(JSON.parse(savedReviews));
      } catch {}
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
              }
            }
          } catch {}
          window.history.replaceState({}, "", "/");
        })();
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
      setStep("landing");
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
    setContractText("");
    setUploadedPages([]);
    setShowPaste(false);
    setError("");
    setView("app");
    setTab("home");
    setStep("context");
  };

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("upload");
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setExtracting(true);
    const list = Array.from(files).slice(0, 12);
    let combined = contractText;
    const newPages: UploadedPage[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Could not read ${file.name}`);
        const text = (data.text || "").trim();
        if (!text) continue;
        const pageLabel = data.fileName || file.name || `Page ${uploadedPages.length + newPages.length + 1}`;
        combined = combined ? `${combined}\n\n--- ${pageLabel} ---\n\n${text}` : text;
        newPages.push({ id: `${Date.now()}-${i}`, name: pageLabel, chars: text.length });
      }
      setContractText(combined);
      setUploadedPages((prev) => [...prev, ...newPages]);
      setShowPaste(false);
    } catch (err: any) {
      setError(err.message || "Could not read one of the files.");
    } finally {
      setExtracting(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearAllUploads = () => {
    setUploadedPages([]);
    setContractText("");
    setError("");
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Add a photo, Word file, or paste the text.");
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
      if (!user.isPro) saveUser({ ...user, freeUsed: true });
      setResult(data.result);
      saveReview({
        id: Date.now().toString(),
        date: new Date().toLocaleDateString("en-GB"),
        trade: context.trade,
        projectSize: context.projectSize,
        result: data.result,
        contractPreview:
          uploadedPages.length > 0
            ? `${uploadedPages.length} page(s) · ${context.trade}`
            : contractText.slice(0, 80) + "..."
      });
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setStep("upload");
    }
  };

  const formatResult = (text: string) => {
    const cleaned = text.replace(/^IMPORTANT DISCLAIMER[\s\S]*?(?=##|Risk|$)/i, "").trim();
    const lines = cleaned.split("\n");
    let html = "";
    let inBlockquote = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("### ")) {
        if (inBlockquote) {
          html += "</blockquote>";
          inBlockquote = false;
        }
        const title = line.replace(/^###\s*/, "").replace(/\*\*/g, "");
        html += `<h3 class="text-base font-semibold mt-6 mb-2 text-gray-900 border-b border-gray-100 pb-1">${title}</h3>`;
        continue;
      }
      if (line.startsWith("## ")) {
        if (inBlockquote) {
          html += "</blockquote>";
          inBlockquote = false;
        }
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
          onClick={(e) => {
            e.stopPropagation();
            setShowProfile(!showProfile);
          }}
          className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center"
        >
          {user.email.charAt(0).toUpperCase()}
        </button>
        {showProfile && (
          <div
            className="absolute right-0 mt-2 w-56 bg-white border rounded-xl shadow-lg p-3 z-30"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-gray-500">Signed in as</p>
            <p className="text-sm font-medium truncate">{user.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              {user.isPro ? "Pro plan" : user.freeUsed ? "Free check used" : "Free check available"}
            </p>
            {!user.isPro && (
              <button
                onClick={() => {
                  setShowProfile(false);
                  setShowSubscribe(true);
                }}
                className="mt-2 w-full text-left text-sm text-blue-600 px-2 py-1.5"
              >
                Upgrade to Pro
              </button>
            )}
            <button onClick={logout} className="mt-1 w-full text-left text-sm text-red-600 px-2 py-1.5">
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
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">Verify your email</h1>
          <p className="text-sm text-gray-600 text-center">
            Code for <span className="font-medium">{pendingEmail}</span>
          </p>
          {devCode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-xs">Your code is:</p>
              <p className="text-2xl font-bold tracking-widest">{devCode}</p>
            </div>
          )}
          <form onSubmit={handleVerify} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              className="w-full rounded-lg border px-3 py-2.5 text-center text-lg tracking-widest"
              value={verifyCodeInput}
              onChange={(e) => setVerifyCodeInput(e.target.value.replace(/\D/g, ""))}
            />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">
              Verify and continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">{authMode === "signup" ? "Create account" : "Log in"}</h1>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-lg border px-3 py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              placeholder="Password (min 6)"
              className="w-full rounded-lg border px-3 py-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">
              {authMode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-500">
            {authMode === "signup" ? (
              <>
                Have an account?{" "}
                <button className="text-blue-600" onClick={() => setAuthMode("login")}>
                  Log in
                </button>
              </>
            ) : (
              <>
                New?{" "}
                <button className="text-blue-600" onClick={() => setAuthMode("signup")}>
                  Sign up
                </button>
              </>
            )}
          </p>
          <button className="text-xs text-gray-400 w-full" onClick={() => setAuthMode(null)}>
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
          <h1 className="text-xl font-bold text-center">Free check used</h1>
          <p className="text-sm text-gray-600 text-center">Unlock unlimited checks with Pro — £19/month</p>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <button
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl"
            disabled={checkoutLoading}
            onClick={startCheckout}
          >
            {checkoutLoading ? "Opening Stripe…" : "Subscribe with Stripe"}
          </button>
          <button className="w-full text-sm text-gray-500" onClick={() => setShowSubscribe(false)}>
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  if (view === "marketing") {
    return (
      <div className="min-h-screen flex flex-col" onClick={() => showProfile && setShowProfile(false)}>
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="font-bold text-lg">
              Guard<span className="text-blue-600">Construct</span>
            </div>
            <div className="flex items-center gap-3">
              {user && user.verified ? (
                <ProfileButton />
              ) : (
                <button onClick={() => setAuthMode("login")} className="text-sm text-gray-600">
                  Log in
                </button>
              )}
              <button onClick={startCheck} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Check a document
              </button>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          {checkoutMsg && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-900 text-sm rounded-xl px-4 py-3">
              {checkoutMsg}
            </div>
          )}
          <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Built for UK contractors</p>
          <h1 className="text-4xl font-bold">
            Before you sign it,
            <br />
            know what it means.
          </h1>
          <p className="mt-5 text-lg text-gray-600">
            Photograph or upload a contract. Get plain-English payment risks.
          </p>
          <button onClick={startCheck} className="mt-8 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl">
            Check a document — Free
          </button>

          <div className="mt-16 text-left space-y-4">
            <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide">What contractors say</p>
            <div className="bg-white rounded-2xl border p-5 shadow-sm">
              <p className="text-amber-400 text-sm mb-2">★★★★★</p>
              <p className="text-sm text-gray-700">
                “Caught a pay-when-paid clause before I signed. Would have sat on £18k for months.”
              </p>
              <p className="mt-3 text-sm font-semibold">James R. · Framing subcontractor</p>
            </div>
            <div className="bg-white rounded-2xl border p-5 shadow-sm">
              <p className="text-amber-400 text-sm mb-2">★★★★★</p>
              <p className="text-sm text-gray-700">
                “Plain English on what hits cash flow. Worth the free check alone before a £90k package.”
              </p>
              <p className="mt-3 text-sm font-semibold">Dave K. · Groundworks</p>
            </div>
          </div>
        </main>
        <footer className="border-t py-8 text-center text-xs text-gray-500">
          Commercial risk identification only. Not legal advice.
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]" onClick={() => showProfile && setShowProfile(false)}>
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              setTab("home");
              setStep("landing");
            }}
            className="font-bold text-lg"
          >
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
          <button
            onClick={() => {
              setTab("home");
              setStep("landing");
            }}
            className={`py-2.5 border-b-2 ${tab === "home" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}
          >
            Home
          </button>
          <button
            onClick={() => setTab("reviews")}
            className={`py-2.5 border-b-2 ${tab === "reviews" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}
          >
            My Reviews
          </button>
          <button
            onClick={() => setTab("about")}
            className={`py-2.5 border-b-2 ${tab === "about" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}
          >
            About
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {tab === "home" && (
          <>
            {step === "landing" && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border p-5 space-y-3">
                  <h1 className="text-2xl font-bold">Check a document</h1>
                  <p className="text-sm text-gray-600">Photograph pages, upload Word, or paste text.</p>
                  <button onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                    Start a new check →
                  </button>
                </div>
              </div>
            )}

            {step === "context" && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">About this job</h1>
                <form onSubmit={handleContextSubmit} className="bg-white rounded-2xl border p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Trade / work</label>
                    <input
                      required
                      type="text"
                      className="w-full rounded-lg border px-3 py-2.5"
                      value={context.trade}
                      onChange={(e) => setContext({ ...context, trade: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Package size</label>
                    <select
                      required
                      className="w-full rounded-lg border px-3 py-2.5"
                      value={context.projectSize}
                      onChange={(e) => setContext({ ...context, projectSize: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Under £10k">Under £10,000</option>
                      <option value="£10k–£50k">£10,000 – £50,000</option>
                      <option value="£50k–£250k">£50,000 – £250,000</option>
                      <option value="£250k+">£250,000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Duration</label>
                    <select
                      required
                      className="w-full rounded-lg border px-3 py-2.5"
                      value={context.duration}
                      onChange={(e) => setContext({ ...context, duration: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Under 1 month">Under 1 month</option>
                      <option value="1–3 months">1–3 months</option>
                      <option value="3–6 months">3–6 months</option>
                      <option value="6+ months">6+ months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Your role</label>
                    <select
                      required
                      className="w-full rounded-lg border px-3 py-2.5"
                      value={context.role}
                      onChange={(e) => setContext({ ...context, role: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Subcontractor">Subcontractor</option>
                      <option value="Sub-subcontractor">Sub-subcontractor</option>
                      <option value="Direct to client">Direct to client</option>
                      <option value="Freelance / labour-only">Freelance / labour-only</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                    Continue →
                  </button>
                </form>
              </div>
            )}

            {step === "upload" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold">Add the document</h1>
                  <p className="text-gray-600 text-sm mt-1">Take photos of the pages, or upload a Word file.</p>
                </div>
                <div className="bg-white rounded-2xl border p-5 space-y-4">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => processFiles(e.target.files)}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => processFiles(e.target.files)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={extracting}
                      onClick={() => cameraInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl py-5 text-sm font-medium disabled:opacity-60"
                    >
                      Take photo
                    </button>
                    <button
                      type="button"
                      disabled={extracting}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl py-5 text-sm font-medium disabled:opacity-60"
                    >
                      Upload file
                    </button>
                  </div>
                  {extracting && <p className="text-sm text-center text-gray-500">Reading document…</p>}
                  {uploadedPages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {uploadedPages.length} page{uploadedPages.length === 1 ? "" : "s"} ready
                        </p>
                        <button type="button" onClick={clearAllUploads} className="text-xs text-red-600">
                          Clear all
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {uploadedPages.map((p, idx) => (
                          <li key={p.id} className="flex items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                            <span className="text-gray-400 mr-2">{idx + 1}.</span>
                            <span className="truncate">{p.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPaste(!showPaste)}
                    className="text-sm text-blue-600 w-full text-center"
                  >
                    {showPaste ? "Hide paste box" : "Or paste text instead"}
                  </button>
                  {showPaste && (
                    <textarea
                      rows={6}
                      placeholder="Paste contract text here…"
                      className="w-full rounded-lg border px-3 py-2.5 text-sm"
                      value={contractText}
                      onChange={(e) => {
                        setContractText(e.target.value);
                        if (!e.target.value.trim()) setUploadedPages([]);
                      }}
                    />
                  )}
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    onClick={runReview}
                    disabled={extracting || !contractText.trim()}
                    className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50"
                  >
                    Run check →
                  </button>
                </div>
              </div>
            )}

            {step === "loading" && (
              <div className="text-center py-16 space-y-4">
                <div className="text-3xl animate-pulse">⏳</div>
                <h1 className="text-xl font-bold">Checking the document…</h1>
              </div>
            )}

            {step === "results" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">Risk dashboard</h1>
                  <button onClick={() => setStep("landing")} className="text-sm text-blue-600">
                    Done
                  </button>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
                  <p className="font-bold text-red-900">Not legal advice</p>
                  <p className="text-red-800 mt-1">Commercial risk identification only.</p>
                </div>
                <div
                  className="bg-white rounded-2xl border p-5"
                  dangerouslySetInnerHTML={{ __html: formatResult(result) }}
                />
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
            {reviews.length === 0 && <p className="text-sm text-gray-600">No reviews yet.</p>}
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border p-5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{r.trade}</span>
                  <span className="text-gray-500">{r.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "about" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">About</h1>
            <div className="bg-white rounded-2xl border p-5 text-sm text-gray-700">
              <p>GuardConstruct helps small UK contractors understand construction paperwork before they sign.</p>
              <p className="text-gray-500 mt-2">Commercial risk identification only. Not legal advice.</p>
            </div>
          </div>
        )}
      </main>
      <footer className="border-t py-4 text-center text-xs text-gray-500">
        Commercial risk identification only. Not legal advice.
      </footer>
    </div>
  );
}
