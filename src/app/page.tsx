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
};

export default function HomePage() {
  const [view, setView] = useState<"marketing" | "app">("marketing");
  const [tab, setTab] = useState<"home" | "reviews" | "about">("home");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("gc_user");
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch {}
    }
    const savedReviews = localStorage.getItem("gc_reviews");
    if (savedReviews) {
      try { setReviews(JSON.parse(savedReviews)); } catch {}
    }
  }, []);

  const saveUser = (u: User) => {
    setUser(u);
    localStorage.setItem("gc_user", JSON.stringify(u));
  };

  const saveReview = (r: Review) => {
    const updated = [r, ...reviews].slice(0, 20);
    setReviews(updated);
    localStorage.setItem("gc_reviews", JSON.stringify(updated));
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
      const newUser: User = { email: email.toLowerCase(), password, freeUsed: false };
      localStorage.setItem("gc_user_" + email.toLowerCase(), JSON.stringify(newUser));
      saveUser(newUser);
      setAuthMode(null);
      setView("app");
      setStep("context");
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
      saveUser(u);
      setAuthMode(null);
      setView("app");
      setStep("context");
    }
  };

  const startCheck = () => {
    if (!user) {
      setAuthMode("signup");
      return;
    }
    if (user.freeUsed) {
      setShowSubscribe(true);
      return;
    }
    setView("app");
    setStep("context");
  };

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("upload");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isText = file.type.startsWith("text/") || /\.(txt|md|text|csv)$/i.test(file.name);
    if (!isText) {
      alert("Please upload a text file (.txt). For PDFs or photos, copy the text and paste it below for now.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setContractText((ev.target?.result as string) || "");
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Please paste some contract text or upload a text file.");
      return;
    }
    if (!user) return;
    if (user.freeUsed) {
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
      const updatedUser = { ...user, freeUsed: true };
      localStorage.setItem("gc_user_" + user.email, JSON.stringify(updatedUser));
      saveUser(updatedUser);
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

  // ========== AUTH MODAL ==========
  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">
            {authMode === "signup" ? "Create your free account" : "Log in"}
          </h1>
          <p className="text-sm text-gray-600 text-center">First document check is free. No card needed.</p>
          <form onSubmit={handleAuth} className="space-y-3">
            <input type="email" required placeholder="Email" className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="Password (min 6 characters)" className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={password} onChange={(e) => setPassword(e.target.value)} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">
              {authMode === "signup" ? "Create account & continue" : "Log in & continue"}
            </button>
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

  // ========== SUBSCRIBE MODAL ==========
  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border shadow-lg p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">You’ve used your free check</h1>
          <p className="text-sm text-gray-600 text-center">Unlock more document checks when you need them.</p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold">GuardConstruct Pro – £19 / month</p>
            <p>• Unlimited document checks</p>
            <p>• Saved history of every job</p>
            <p>• Priority improvements</p>
          </div>
          <button className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl"
            onClick={() => alert("Payment will be connected soon.")}>
            Subscribe (coming soon)
          </button>
          <button className="w-full text-sm text-gray-500" onClick={() => { setShowSubscribe(false); setView("marketing"); }}>
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // ========== MARKETING HOMEPAGE ==========
  if (view === "marketing") {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Nav */}
        <header className="sticky top-0 z-20 bg-[#FAFAF9]/90 backdrop-blur border-b border-gray-200/80">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="font-bold text-lg tracking-tight">
              Guard<span className="text-blue-600">Construct</span>
            </div>
            <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
              <a href="#how" className="hover:text-gray-900">How it works</a>
              <a href="#docs" className="hover:text-gray-900">For contractors</a>
              <a href="#pricing" className="hover:text-gray-900">Pricing</a>
            </nav>
            <button onClick={startCheck} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Check a document
            </button>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="max-w-5xl mx-auto px-4 pt-12 pb-16 sm:pt-20 sm:pb-24">
            <div className="text-center max-w-2xl mx-auto">
              <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Built for UK contractors</p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15] text-gray-900">
                Before you sign it,<br />know what it means.
              </h1>
              <p className="mt-5 text-lg text-gray-600 leading-relaxed">
                Take a photo of a contract, variation, site instruction or other document.
                Get a plain-English explanation of what you’re agreeing to — including anything that could affect your payment.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={startCheck} className="w-full sm:w-auto bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl text-base shadow-sm hover:bg-blue-700">
                  Check a document — Free
                </button>
              </div>
              <p className="mt-3 text-sm text-gray-500">No credit card · Results in minutes · Built for construction</p>
            </div>

            {/* Product mockup */}
            <div className="mt-14 max-w-lg mx-auto">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                  <span className="text-xs text-gray-400 ml-2">Document check</span>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-sm font-semibold text-gray-900">3 things to check before signing</p>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">High risk — Payment</p>
                      <p className="text-sm text-gray-800 mt-1">This document appears to allow deductions from your payment under certain circumstances.</p>
                    </div>
                    <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">High risk — Variations</p>
                      <p className="text-sm text-gray-800 mt-1">Signing this may confirm that the work listed is included in your existing price.</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Medium — Liability</p>
                      <p className="text-sm text-gray-800 mt-1">You may be accepting responsibility for defects beyond your original scope.</p>
                    </div>
                  </div>
                  <button className="w-full text-sm font-medium text-blue-600 border border-blue-200 rounded-lg py-2.5 bg-blue-50/50">
                    Ask about this document →
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Trust strip */}
          <section className="border-y border-gray-200 bg-white">
            <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center sm:text-left">
              {[
                { t: "Photograph it", d: "Take a photo or upload the document." },
                { t: "Construction-specific", d: "Designed around UK construction paperwork." },
                { t: "Clause-level answers", d: "See exactly where the concern comes from." },
                { t: "Plain English", d: "No QS or legal jargon required." }
              ].map((item) => (
                <div key={item.t}>
                  <p className="font-semibold text-sm text-gray-900">{item.t}</p>
                  <p className="text-sm text-gray-500 mt-1">{item.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Problem */}
          <section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">You’ve probably signed something like this before.</h2>
            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {["Just sign this here.", "It’s only a standard form.", "We’ll sort the payment later.", "Everyone signs it."].map((q) => (
                <div key={q} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 italic">“{q}”</div>
              ))}
            </div>
            <p className="mt-10 text-center text-lg font-semibold text-gray-900">And three months later…</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["Payment withheld", "Variation rejected", "Retention disputed", "“You agreed to this in the paperwork.”"].map((c) => (
                <span key={c} className="bg-red-50 text-red-800 text-sm px-3 py-1.5 rounded-full border border-red-100">{c}</span>
              ))}
            </div>
            <p className="mt-10 text-center text-gray-600 leading-relaxed max-w-xl mx-auto">
              The problem isn’t that you’re careless.<br />
              It’s that construction paperwork is written for lawyers and commercial teams — while you’re trying to run a job.
            </p>
          </section>

          {/* How it works */}
          <section id="how" className="bg-white border-y border-gray-200 py-16 sm:py-20">
            <div className="max-w-5xl mx-auto px-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">From paperwork to answers in minutes.</h2>
              <div className="mt-12 grid sm:grid-cols-3 gap-8">
                {[
                  { n: "01", t: "Photograph", d: "Take a photo or upload the document." },
                  { n: "02", t: "Analyse", d: "The document is checked for payment, variation, liability, retention, deduction, defect and notice risks." },
                  { n: "03", t: "Decide", d: "See what matters, why it matters and what to ask before you sign." }
                ].map((s) => (
                  <div key={s.n} className="text-center sm:text-left">
                    <p className="text-sm font-semibold text-blue-600">{s.n}</p>
                    <p className="mt-2 font-semibold text-gray-900">{s.t}</p>
                    <p className="mt-1 text-sm text-gray-600">{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* What could this cost me */}
          <section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">What could this cost me?</h2>
            <p className="mt-3 text-center text-gray-600">We turn complicated wording into clear commercial consequences.</p>
            <div className="mt-10 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span className="font-semibold text-amber-900">Payment risk</span>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <p className="font-medium text-gray-900">They may be able to deduct money from your payment.</p>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Why</p>
                  <p className="mt-1 text-gray-700">Clause 8.4 gives the contractor a right to set off certain costs.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What this could mean</p>
                  <p className="mt-1 text-gray-700">If they claim you’re responsible for additional costs, they may attempt to deduct them from money otherwise due to you.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Before signing, ask</p>
                  <p className="mt-1 text-gray-700">“Can you confirm exactly what deductions can be made under this clause and whether they require prior notice?”</p>
                </div>
                <button className="text-blue-600 font-medium text-sm">Show me the clause →</button>
              </div>
            </div>
          </section>

          {/* Document types */}
          <section id="docs" className="bg-white border-y border-gray-200 py-16 sm:py-20">
            <div className="max-w-5xl mx-auto px-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">Check more than just contracts.</h2>
              <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { t: "Contracts", d: "Understand what you’re agreeing to before taking on a job." },
                  { t: "Payment paperwork", d: "Spot terms that could delay, reduce or complicate payment." },
                  { t: "Variations", d: "Check whether you’re accidentally agreeing to additional work for the original price." },
                  { t: "Site instructions", d: "Understand what signing the instruction actually confirms." },
                  { t: "Timesheets & daywork", d: "Check what you’re confirming about hours, materials and work completed." },
                  { t: "Waivers & settlements", d: "Understand whether you’re giving up the right to make a future claim." }
                ].map((card) => (
                  <div key={card.t} className="rounded-xl border border-gray-200 p-5 hover:border-blue-200 transition-colors">
                    <p className="font-semibold text-gray-900">{card.t}</p>
                    <p className="mt-1.5 text-sm text-gray-600">{card.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Why different */}
          <section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">Built for the moment you actually need it.</h2>
            <div className="mt-10 grid sm:grid-cols-2 gap-6">
              <div className="rounded-xl border border-gray-200 p-5 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Traditional tools</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Upload a full contract</li>
                  <li>Wait for a long report</li>
                  <li>Read a commercial risk register</li>
                </ul>
              </div>
              <div className="rounded-xl border border-blue-200 p-5 bg-blue-50/50">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">This product</p>
                <ul className="space-y-2 text-sm text-gray-800">
                  <li>Take a photo</li>
                  <li>Get the important points</li>
                  <li>Know what to ask before signing</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" className="bg-white border-y border-gray-200 py-16 sm:py-20">
            <div className="max-w-3xl mx-auto px-4 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Try it before you pay.</h2>
              <p className="mt-3 text-gray-600">No large subscription required just to check an occasional document.</p>
              <div className="mt-10 grid sm:grid-cols-2 gap-4 text-left">
                <div className="rounded-2xl border-2 border-blue-600 bg-white p-6">
                  <p className="text-sm font-semibold text-blue-600">Free</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">£0</p>
                  <p className="mt-1 text-sm text-gray-500">1 document check</p>
                  <ul className="mt-4 space-y-2 text-sm text-gray-700">
                    <li>• Full payment trap analysis</li>
                    <li>• Plain-English explanations</li>
                    <li>• Suggested questions to ask</li>
                  </ul>
                  <button onClick={startCheck} className="mt-6 w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl">
                    Check a document — Free
                  </button>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <p className="text-sm font-semibold text-gray-500">Pro</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">£19<span className="text-base font-normal text-gray-500">/month</span></p>
                  <p className="mt-1 text-sm text-gray-500">Unlimited checks</p>
                  <ul className="mt-4 space-y-2 text-sm text-gray-700">
                    <li>• Unlimited document checks</li>
                    <li>• Saved history</li>
                    <li>• Priority improvements</li>
                  </ul>
                  <button onClick={() => setShowSubscribe(true)} className="mt-6 w-full border border-gray-300 text-gray-800 font-semibold py-2.5 rounded-xl">
                    Coming soon
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">Questions</h2>
            <div className="mt-10 space-y-6">
              {[
                { q: "Is this legal advice?", a: "No. This is commercial risk identification and plain-English explanation only. It is not legal advice and does not create a solicitor–client relationship. High-value or complex documents should still be reviewed by a qualified construction solicitor." },
                { q: "Can I photograph a document?", a: "You can upload a text file or paste text from a photo or PDF. Full camera OCR for photos is planned; for now the most reliable method is to copy the text and paste it." },
                { q: "What documents can I check?", a: "Contracts, payment paperwork, variations, site instructions, timesheets, daywork sheets, waivers and settlements — anything that could affect what you’re agreeing to or what you get paid." },
                { q: "How long does analysis take?", a: "Usually under a minute for typical construction paperwork." },
                { q: "Are my documents private?", a: "Documents are sent for analysis and are not used to train models. We do not sell your data." },
                { q: "What happens if the AI gets something wrong?", a: "The output is a first-pass commercial review only. You remain responsible for any decision to sign or not sign. Always apply your own judgement, and use a solicitor for high-value or unusual documents." }
              ].map((f) => (
                <div key={f.q}>
                  <p className="font-semibold text-gray-900">{f.q}</p>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Final CTA */}
          <section className="bg-gray-900 text-white py-16 sm:py-20">
            <div className="max-w-2xl mx-auto px-4 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                The next time someone puts paperwork in front of you, check it first.
              </h2>
              <p className="mt-4 text-gray-300">Take a photo. Know what you’re signing.</p>
              <button onClick={startCheck} className="mt-8 bg-white text-gray-900 font-semibold px-8 py-3.5 rounded-xl">
                Check a document — Free
              </button>
            </div>
          </section>
        </main>

        <footer className="border-t border-gray-200 py-10">
          <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between gap-6 text-sm text-gray-500">
            <div>
              <p className="font-semibold text-gray-900">GuardConstruct</p>
              <p className="mt-1">Commercial risk identification only. Not legal advice.</p>
            </div>
            <div className="flex gap-8">
              <div className="space-y-1">
                <p className="font-medium text-gray-700">Product</p>
                <a href="#how" className="block hover:text-gray-900">How it works</a>
                <a href="#pricing" className="block hover:text-gray-900">Pricing</a>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-gray-700">Legal</p>
                <p>Terms</p>
                <p>Privacy</p>
                <p>Disclaimer</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ========== APP (existing flow) ==========
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => { setView("marketing"); setStep("landing"); }} className="font-bold text-lg tracking-tight">
            Guard<span className="text-blue-600">Construct</span>
          </button>
          <div className="text-xs text-gray-500">English law · Under 25 staff</div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-6 text-sm border-t">
          <button onClick={() => { setTab("home"); setStep("landing"); }} className={`py-2.5 border-b-2 ${tab === "home" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>Home</button>
          <button onClick={() => setTab("reviews")} className={`py-2.5 border-b-2 ${tab === "reviews" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>My Reviews</button>
          <button onClick={() => setTab("about")} className={`py-2.5 border-b-2 ${tab === "about" ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500"}`}>About</button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {tab === "home" && (
          <>
            {step === "landing" && (
              <div className="space-y-6 text-center pt-6">
                <h1 className="text-2xl font-bold">Check a document</h1>
                <p className="text-gray-600 text-sm">First check is free. Paste or upload the pages that matter.</p>
                <button onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                  {user?.freeUsed ? "Start another check →" : "Start free check →"}
                </button>
                {user && <p className="text-xs text-gray-500">Logged in as {user.email}</p>}
              </div>
            )}

            {step === "context" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold">About this job</h1>
                  <p className="text-gray-600 text-sm mt-1">A little context helps the analysis.</p>
                </div>
                <form onSubmit={handleContextSubmit} className="bg-white rounded-2xl border p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Trade / work</label>
                    <input required type="text" placeholder="e.g. Electrical, Groundworks..." className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={context.trade} onChange={(e) => setContext({ ...context, trade: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Package size</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={context.projectSize} onChange={(e) => setContext({ ...context, projectSize: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under £10k">Under £10,000</option>
                      <option value="£10k–£50k">£10,000 – £50,000</option>
                      <option value="£50k–£250k">£50,000 – £250,000</option>
                      <option value="£250k+">£250,000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Duration</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={context.duration} onChange={(e) => setContext({ ...context, duration: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under 1 month">Under 1 month</option>
                      <option value="1–3 months">1–3 months</option>
                      <option value="3–6 months">3–6 months</option>
                      <option value="6+ months">6+ months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Your role</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5" value={context.role} onChange={(e) => setContext({ ...context, role: e.target.value })}>
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
                  <p className="text-gray-600 text-sm mt-1">Paste text or upload a .txt file. Payment, retention and notice pages work best.</p>
                </div>
                <div className="bg-white rounded-2xl border p-5 space-y-4">
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.text,text/plain" className="hidden" onChange={handleFileUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-600">
                    {fileName ? `Uploaded: ${fileName}` : "Upload a text file (.txt)"}
                  </button>
                  <textarea rows={10} placeholder="Or paste the relevant clauses here..." className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base" value={contractText} onChange={(e) => { setContractText(e.target.value); setFileName(""); }} />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button onClick={runReview} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Run free check →</button>
                </div>
                <p className="text-xs text-center text-gray-500">Commercial risk identification only. Not legal advice.</p>
              </div>
            )}

            {step === "loading" && (
              <div className="text-center py-16 space-y-4">
                <div className="text-3xl animate-pulse">⏳</div>
                <h1 className="text-xl font-bold">Checking the document...</h1>
                <p className="text-gray-600 text-sm">Looking for payment, variation and liability risks under English law.</p>
              </div>
            )}

            {step === "results" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">What to check before signing</h1>
                  <button onClick={() => setStep("landing")} className="text-sm text-blue-600">New check</button>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
                  <p className="font-bold text-red-900">Not legal advice</p>
                  <p className="text-red-800 mt-1">This is commercial risk identification only. High-value or complex documents should still go to a construction solicitor.</p>
                </div>
                <div className="bg-white rounded-2xl border p-5" dangerouslySetInnerHTML={{ __html: formatResult(result) }} />
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm space-y-2">
                  <p className="font-semibold">What to do next</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-700">
                    <li>Note the questions to ask before signing.</li>
                    <li>Copy any suggested wording that helps you negotiate.</li>
                    <li>If the job is high value, still speak to a solicitor.</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "reviews" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">My Reviews</h1>
            {!user && <p className="text-sm text-gray-600">Log in to see saved reviews.</p>}
            {user && reviews.length === 0 && <p className="text-sm text-gray-600">No reviews yet.</p>}
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
            <div className="bg-white rounded-2xl border p-5 text-sm text-gray-700 space-y-3">
              <p>GuardConstruct helps small UK contractors and freelancers understand construction paperwork before they sign.</p>
              <p>It is commercial risk identification only — not legal advice.</p>
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
