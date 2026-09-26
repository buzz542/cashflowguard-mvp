"use client";

import { useState, useEffect, useRef } from "react";
import ReviewResults from "./ReviewResults";

type User = { email: string; password: string; freeUsed: boolean; isPro?: boolean };

export default function HomePage() {
  const [view, setView] = useState<"marketing" | "app">("marketing");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [step, setStep] = useState<"landing" | "context" | "upload" | "loading" | "results">("landing");
  const [context, setContext] = useState({ trade: "", projectSize: "", duration: "", role: "" });
  const [contractText, setContractText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("gc_user");
      if (s) setUser(JSON.parse(s));
    } catch {}
  }, []);

  const saveUser = (u: User) => {
    setUser(u);
    localStorage.setItem("gc_user", JSON.stringify(u));
    localStorage.setItem("gc_user_" + u.email, JSON.stringify(u));
  };

  const canRun = (u: User | null) => !!u && (u.isPro || !u.freeUsed);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!email.includes("@") || password.length < 6) {
      setAuthError("Valid email and password (min 6) required.");
      return;
    }
    if (authMode === "signup") {
      if (localStorage.getItem("gc_user_" + email.toLowerCase())) {
        setAuthError("Account exists. Please log in.");
        return;
      }
      const u: User = { email: email.toLowerCase(), password, freeUsed: false, isPro: false };
      localStorage.setItem("gc_user_" + u.email, JSON.stringify(u));
      saveUser(u);
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
    }
    setAuthMode(null);
    setView("app");
    setStep("landing");
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
    } catch (err: any) {
      setError(err.message || "Upload failed");
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
        body: JSON.stringify({ context, contractText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      if (!user.isPro) saveUser({ ...user, freeUsed: true });
      setResult(data.result);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("upload");
    }
  };

  const startCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setAuthError(err.message);
      setCheckoutLoading(false);
    }
  };

  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">{authMode === "signup" ? "Create account" : "Log in"}</h1>
          <form onSubmit={handleAuth} className="space-y-3">
            <input type="email" required placeholder="Email" className="w-full rounded-lg border px-3 py-2.5" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="Password (min 6)" className="w-full rounded-lg border px-3 py-2.5" value={password} onChange={(e) => setPassword(e.target.value)} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">{authMode === "signup" ? "Create account" : "Log in"}</button>
          </form>
          <p className="text-xs text-center text-gray-500">
            {authMode === "signup" ? (
              <>
                Have an account? <button type="button" className="text-blue-600" onClick={() => setAuthMode("login")}>Log in</button>
              </>
            ) : (
              <>
                New? <button type="button" className="text-blue-600" onClick={() => setAuthMode("signup")}>Sign up</button>
              </>
            )}
          </p>
          <button type="button" className="text-xs text-gray-400 w-full" onClick={() => setAuthMode(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">Free check used</h1>
          <p className="text-sm text-gray-600 text-center">Pro is £19/month for unlimited checks. Spot payment traps before you sign.</p>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <button className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl" disabled={checkoutLoading} onClick={startCheckout}>
            {checkoutLoading ? "Opening Stripe…" : "Subscribe — £19/month"}
          </button>
          <button type="button" className="w-full text-sm text-gray-500" onClick={() => setShowSubscribe(false)}>Maybe later</button>
        </div>
      </div>
    );
  }

  if (view === "marketing") {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="GuardConstruct" className="h-8 w-auto" />
              <span className="font-bold text-base tracking-tight hidden sm:inline">Guard<span className="text-blue-600">Construct</span></span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
              <a href="#how" className="hover:text-gray-900">How it works</a>
              <a href="#features" className="hover:text-gray-900">Features</a>
              <a href="#pricing" className="hover:text-gray-900">Pricing</a>
              <a href="#roadmap" className="hover:text-gray-900">Roadmap</a>
            </nav>
            <div className="flex items-center gap-3">
              {user ? (
                <button type="button" className="text-sm text-gray-600" onClick={() => { setUser(null); localStorage.removeItem("gc_user"); }}>Log out</button>
              ) : (
                <button type="button" onClick={() => setAuthMode("login")} className="text-sm text-gray-600">Log in</button>
              )}
              <button type="button" onClick={startCheck} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Check a document
              </button>
            </div>
          </div>
        </header>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase mb-5">Cash flow protection</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
            Before you sign it,<br className="hidden sm:block" /> know what it means.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Photograph or upload a construction contract. Get plain-English payment risks under English law — so you get paid on time, not left chasing retention and pay-when-paid clauses.
          </p>
          <button type="button" onClick={startCheck} className="mt-8 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl text-base">
            Check a document — free first pass
          </button>
          <p className="mt-4 text-xs text-gray-500">Built for UK subcontractors and freelancers under 25 staff. Not legal advice.</p>
        </section>

        <section className="border-y bg-white/50 py-8">
          <p className="text-center text-xs font-semibold tracking-widest text-gray-500 uppercase mb-4">Trusted by early UK contractors</p>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-12 px-4 text-sm font-semibold text-gray-400">
            <span>Framing · Groundworks</span>
            <span>Electrical · Plumbing</span>
            <span>Joinery · M&E</span>
            <span>Fit-out · Civils</span>
          </div>
        </section>

        <section id="how" className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-10">Get paid faster. Avoid the traps.</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border p-6">
              <p className="text-xs font-bold text-blue-600 mb-2">01</p>
              <h3 className="font-bold text-lg mb-2">Add the job context</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Trade, package size, duration and your role. More context means a sharper risk read.</p>
            </div>
            <div className="bg-white rounded-2xl border p-6">
              <p className="text-xs font-bold text-blue-600 mb-2">02</p>
              <h3 className="font-bold text-lg mb-2">Photo, PDF or Word</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Take a photo of each page, upload a PDF or .docx, or paste text. Multiple pages supported.</p>
            </div>
            <div className="bg-white rounded-2xl border p-6">
              <p className="text-xs font-bold text-blue-600 mb-2">03</p>
              <h3 className="font-bold text-lg mb-2">Plain-English risks</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Traffic-light flags on payment timing, retention, pay-when-paid, LADs and notice traps — with what to push back on.</p>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white border-y py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-3">Built for construction payment risk</h2>
            <p className="text-center text-gray-600 mb-10 max-w-xl mx-auto">Focused on English law and the clauses that actually stop small firms getting paid.</p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="rounded-2xl border p-6">
                <h3 className="font-bold text-lg mb-2">Payment trap detection</h3>
                <p className="text-sm text-gray-600 leading-relaxed">Flags pay-when-paid, conditional payment, extended valuation periods, and retention release conditions that stretch cash.</p>
              </div>
              <div className="rounded-2xl border p-6">
                <h3 className="font-bold text-lg mb-2">JCT / NEC aware</h3>
                <p className="text-sm text-gray-600 leading-relaxed">Reviews common UK standard forms and site-amended versions for the clauses that hit subcontractors hardest.</p>
              </div>
              <div className="rounded-2xl border p-6">
                <h3 className="font-bold text-lg mb-2">Negotiation cheat sheet</h3>
                <p className="text-sm text-gray-600 leading-relaxed">Not just “this is risky” — practical wording you can take back to the main contractor before you sign.</p>
              </div>
              <div className="rounded-2xl border p-6">
                <h3 className="font-bold text-lg mb-2">Photo or document upload</h3>
                <p className="text-sm text-gray-600 leading-relaxed">Works from the van. Snap pages on site or drop a PDF / Word file. No desktop required.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-10">What contractors say</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-6">
              <p className="text-amber-400 text-sm mb-3">★★★★★</p>
              <p className="text-gray-700 leading-relaxed">“Caught a pay-when-paid clause before I signed. Would have sat on £18k for months.”</p>
              <p className="mt-4 text-sm font-semibold text-gray-900">James R. · Framing subcontractor</p>
            </div>
            <div className="bg-white rounded-2xl border p-6">
              <p className="text-amber-400 text-sm mb-3">★★★★★</p>
              <p className="text-gray-700 leading-relaxed">“Plain English on what hits cash flow. Worth the free check alone — clearer than reading the small print myself.”</p>
              <p className="mt-4 text-sm font-semibold text-gray-900">Dave K. · Groundworks</p>
            </div>
            <div className="bg-white rounded-2xl border p-6 sm:col-span-2 sm:max-w-lg sm:mx-auto">
              <p className="text-amber-400 text-sm mb-3">★★★★★</p>
              <p className="text-gray-700 leading-relaxed">“We use it on every new package now. Takes minutes and stops the usual surprises on retention and notice periods.”</p>
              <p className="mt-4 text-sm font-semibold text-gray-900">CBS Properties · Fit-out (early user)</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-white border-y py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Simple pricing</h2>
            <p className="text-gray-600 mb-10">No demo calls. Start free, upgrade when you need more.</p>
            <div className="grid sm:grid-cols-2 gap-6 text-left">
              <div className="rounded-2xl border p-6">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Free</p>
                <p className="text-3xl font-bold mt-1">£0</p>
                <p className="text-sm text-gray-600 mt-2 mb-4">One full document check to see how it works.</p>
                <ul className="text-sm text-gray-600 space-y-2 mb-6">
                  <li>· Photo, PDF or Word upload</li>
                  <li>· Payment risk flags</li>
                  <li>· Plain-English summary</li>
                </ul>
                <button type="button" onClick={startCheck} className="w-full border border-gray-300 font-semibold py-2.5 rounded-xl hover:bg-gray-50">Start free check</button>
              </div>
              <div className="rounded-2xl border-2 border-blue-600 p-6">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pro</p>
                <p className="text-3xl font-bold mt-1">£19<span className="text-base font-medium text-gray-500">/month</span></p>
                <p className="text-sm text-gray-600 mt-2 mb-4">Unlimited checks for active packages.</p>
                <ul className="text-sm text-gray-600 space-y-2 mb-6">
                  <li>· Unlimited document reviews</li>
                  <li>· Negotiation suggestions</li>
                  <li>· Priority processing</li>
                </ul>
                <button type="button" onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl">Get Pro</button>
              </div>
            </div>
          </div>
        </section>

        <section id="roadmap" className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-3">On the roadmap</h2>
          <p className="text-center text-gray-600 mb-10 max-w-xl mx-auto">What buyers in this space ask for next. Not live yet — listed so you know where we’re going.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-5">
              <h3 className="font-semibold text-gray-900">Payment reliability lookup</h3>
              <p className="text-sm text-gray-600 mt-1">See how a GC or client has paid on past jobs before you take the package.</p>
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-5">
              <h3 className="font-semibold text-gray-900">Deadline & notice alerts</h3>
              <p className="text-sm text-gray-600 mt-1">Reminders for pay apps, waivers and notice periods so nothing slips.</p>
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-5">
              <h3 className="font-semibold text-gray-900">Accounting integrations</h3>
              <p className="text-sm text-gray-600 mt-1">QuickBooks and similar — link reviews to the jobs already in your books.</p>
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-5">
              <h3 className="font-semibold text-gray-900">Clearer milestone language</h3>
              <p className="text-sm text-gray-600 mt-1">Help draft payment milestones so money isn’t held until vague “practical completion”.</p>
            </div>
          </div>
        </section>

        <section className="border-t bg-white py-14 text-center px-4">
          <h2 className="text-2xl font-bold text-gray-900">Protect the next package you sign</h2>
          <p className="mt-2 text-gray-600">Free first check. Takes a few minutes from your phone or iPad.</p>
          <button type="button" onClick={startCheck} className="mt-6 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl">
            Check a document
          </button>
        </section>

        <footer className="border-t py-8 text-center text-xs text-gray-500 px-4">
          <p className="font-medium text-gray-700 mb-1">GuardConstruct</p>
          <p>Commercial risk identification only. Not legal advice. English law focus for small UK construction firms.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button type="button" onClick={() => { setView("marketing"); setStep("landing"); }} className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-7 w-auto" />
            <span className="font-bold text-lg hidden sm:inline">Guard<span className="text-blue-600">Construct</span></span>
          </button>
          {user && <span className="text-xs text-gray-500 truncate max-w-[140px]">{user.email}{user.isPro ? " · Pro" : ""}</span>}
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {step === "landing" && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <h1 className="text-2xl font-bold">Check a document</h1>
            <p className="text-sm text-gray-600">Photograph pages, upload PDF or Word, or paste text. Get payment risks in plain English.</p>
            <button type="button" onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Start a new check →</button>
          </div>
        )}
        {step === "context" && (
          <form onSubmit={(e) => { e.preventDefault(); setStep("upload"); }} className="bg-white rounded-2xl border p-5 space-y-4">
            <h1 className="text-2xl font-bold">About this job</h1>
            <input required placeholder="Trade / work" className="w-full rounded-lg border px-3 py-2.5" value={context.trade} onChange={(e) => setContext({ ...context, trade: e.target.value })} />
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.projectSize} onChange={(e) => setContext({ ...context, projectSize: e.target.value })}>
              <option value="">Package size</option>
              <option value="Under £10k">Under £10,000</option>
              <option value="£10k–£50k">£10,000 – £50,000</option>
              <option value="£50k–£250k">£50,000 – £250,000</option>
              <option value="£250k+">£250,000+</option>
            </select>
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.duration} onChange={(e) => setContext({ ...context, duration: e.target.value })}>
              <option value="">Duration</option>
              <option value="Under 1 month">Under 1 month</option>
              <option value="1–3 months">1–3 months</option>
              <option value="3–6 months">3–6 months</option>
              <option value="6+ months">6+ months</option>
            </select>
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.role} onChange={(e) => setContext({ ...context, role: e.target.value })}>
              <option value="">Your role</option>
              <option value="Subcontractor">Subcontractor</option>
              <option value="Sub-subcontractor">Sub-subcontractor</option>
              <option value="Direct to client">Direct to client</option>
              <option value="Freelance / labour-only">Freelance / labour-only</option>
            </select>
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Continue →</button>
          </form>
        )}
        {step === "upload" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <h1 className="text-2xl font-bold">Add the document</h1>
            <p className="text-sm text-gray-600">Use photo for paper on site, or upload for PDF / Word files.</p>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => processFiles(e.target.files)} />
            <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,image/*" className="hidden" onChange={(e) => processFiles(e.target.files)} />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={extracting} onClick={() => photoRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl py-5 text-sm font-medium disabled:opacity-60">
                {extracting ? "Reading…" : "📷 Take photo"}
              </button>
              <button type="button" disabled={extracting} onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl py-5 text-sm font-medium disabled:opacity-60">
                {extracting ? "Reading…" : "📄 Upload PDF / Word"}
              </button>
            </div>
            {pages.length > 0 && (
              <ul className="text-sm space-y-1">
                {pages.map((p, i) => (
                  <li key={i} className="bg-gray-50 rounded-lg px-3 py-2">{i + 1}. {p}</li>
                ))}
              </ul>
            )}
            <textarea rows={4} placeholder="Or paste contract text…" className="w-full rounded-lg border px-3 py-2.5 text-sm" value={contractText} onChange={(e) => setContractText(e.target.value)} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" onClick={runReview} disabled={extracting || !contractText.trim()} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50">
              Run check →
            </button>
          </div>
        )}
        {step === "loading" && (
          <div className="text-center py-16">
            <div className="text-3xl animate-pulse">⏳</div>
            <h1 className="text-xl font-bold mt-4">Building your action plan…</h1>
            <p className="text-sm text-gray-500 mt-2">Finding payment risks and what you can do about them</p>
          </div>
        )}
        {step === "results" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Your action plan</h1>
              <button type="button" className="text-sm text-blue-600" onClick={() => setStep("landing")}>Done</button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
              <p className="font-bold text-red-900">Not legal advice</p>
              <p className="text-red-800">Commercial risk identification only. Always get independent advice before relying on this for decisions.</p>
            </div>
            <div className="bg-white rounded-2xl border p-5">
              <ReviewResults result={result} />
            </div>
            <button type="button" onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">Start another check →</button>
          </div>
        )}
      </main>
      <footer className="border-t py-4 text-center text-xs text-gray-500">Commercial risk identification only. Not legal advice.</footer>
    </div>
  );
}
