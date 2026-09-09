"use client";

import { useState, useEffect } from "react";

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

  // Load user + reviews from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("gc_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
    const savedReviews = localStorage.getItem("gc_reviews");
    if (savedReviews) {
      try {
        setReviews(JSON.parse(savedReviews));
      } catch {}
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
      setStep("context");
    }
  };

  const startReview = () => {
    if (!user) {
      setAuthMode("signup");
      return;
    }
    if (user.freeUsed) {
      setShowSubscribe(true);
      return;
    }
    setStep("context");
  };

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("upload");
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Please paste some contract text (payment, retention and notice clauses work best).");
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

      if (!res.ok) {
        throw new Error(data.error || "Review failed");
      }

      // Mark free review as used
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

  // Simple markdown-ish to HTML for results
  const formatResult = (text: string) => {
    // Strip any leading IMPORTANT DISCLAIMER block the model may still produce
    let cleaned = text.replace(/^IMPORTANT DISCLAIMER[\s\S]*?(?=Project context used|Risk Register|$)/i, "").trim();

    return cleaned
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("### ")) {
          return `<h3 key=${i} class="text-lg font-bold mt-5 mb-2 text-gray-900">${line.replace(/^###\s*/, "")}</h3>`;
        }
        if (line.startsWith("## ")) {
          return `<h2 key=${i} class="text-xl font-bold mt-6 mb-3 text-gray-900">${line.replace(/^##\s*/, "")}</h2>`;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return `<p key=${i} class="font-semibold mt-3">${line.replace(/\*\*/g, "")}</p>`;
        }
        if (line.startsWith("> ")) {
          return `<blockquote key=${i} class="border-l-4 border-blue-500 bg-blue-50 pl-3 py-2 my-2 text-sm rounded-r">${line.replace(/^>\s*/, "")}</blockquote>`;
        }
        if (line.trim() === "---" || line.trim() === "") {
          return `<div key=${i} class="h-3"></div>`;
        }
        // Basic bold
        const withBold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        return `<p key=${i} class="mb-2 text-sm leading-relaxed">${withBold}</p>`;
      })
      .join("");
  };

  // ========== AUTH MODAL ==========
  if (authMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border shadow-sm p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">
            {authMode === "signup" ? "Create your free account" : "Log in"}
          </h1>
          <p className="text-sm text-gray-600 text-center">
            Your first review is free. No card needed.
          </p>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              placeholder="Password (min 6 characters)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl">
              {authMode === "signup" ? "Create account & continue" : "Log in & continue"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-500">
            {authMode === "signup" ? (
              <>
                Already have an account?{" "}
                <button className="text-blue-600" onClick={() => setAuthMode("login")}>
                  Log in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button className="text-blue-600" onClick={() => setAuthMode("signup")}>
                  Sign up
                </button>
              </>
            )}
          </p>
          <button className="text-xs text-gray-400 w-full text-center" onClick={() => setAuthMode(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ========== SUBSCRIPTION MODAL ==========
  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border shadow-lg p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">You’ve used your free review</h1>
          <p className="text-sm text-gray-600 text-center">
            Unlock unlimited reviews and keep protecting your cash flow on every job.
          </p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold">GuardConstruct Pro – £19 / month</p>
            <p>• Unlimited contract reviews</p>
            <p>• Saved history of every job</p>
            <p>• Priority improvements</p>
          </div>
          <button
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl"
            onClick={() => alert("Payment integration coming next. For now just close this and continue testing.")}
          >
            Subscribe (coming soon)
          </button>
          <button
            className="w-full text-sm text-gray-500"
            onClick={() => {
              setShowSubscribe(false);
              setStep("landing");
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // ========== MAIN APP SHELL ==========
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-bold text-lg tracking-tight">
            Guard<span className="text-blue-600">Construct</span>
          </div>
          <div className="text-xs text-gray-500">English law • Under 25 staff</div>
        </div>
        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-6 text-sm border-t">
          <button
            onClick={() => { setTab("home"); setStep("landing"); }}
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
        {/* ===== HOME TAB ===== */}
        {tab === "home" && (
          <>
            {step === "landing" && (
              <div className="space-y-8">
                <div className="text-center space-y-4 pt-2">
                  <h1 className="text-3xl font-bold leading-tight">
                    Improve cash flow<br />
                    <span className="text-blue-600">on every job</span>
                  </h1>
                  <p className="text-gray-600">
                    Free first-pass commercial review for small UK construction firms and freelancers.
                    Spot the clauses that delay or reduce payment before you sign.
                  </p>
                  <button
                    onClick={startReview}
                    className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg"
                  >
                    {user ? (user.freeUsed ? "Start another review →" : "Start free review →") : "Create free account & start →"}
                  </button>
                  <p className="text-xs text-gray-500">First review free • No card required • Not legal advice</p>
                </div>

                <div className="bg-white rounded-2xl border p-5 space-y-3">
                  <h2 className="font-bold text-lg">Built for people on site</h2>
                  <p className="text-sm text-gray-700">
                    Paste the payment, retention and notice pages of a subcontract.
                    We flag the commercial traps that most often cause late or reduced payment
                    for firms under 25 people — under English law only.
                  </p>
                </div>

                {user && (
                  <p className="text-center text-sm text-gray-500">
                    Logged in as {user.email}
                    {user.freeUsed ? " • Free review used" : " • Free review available"}
                  </p>
                )}
              </div>
            )}

            {step === "context" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold">Tell us about the job</h1>
                  <p className="text-gray-600 text-sm mt-1">The more context, the better the review.</p>
                </div>
                <form onSubmit={handleContextSubmit} className="bg-white rounded-2xl border p-5 space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-1">What trade / work do you do?</label>
                    <input required type="text" placeholder="e.g. Electrical, Groundworks, Plastering..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      value={context.trade} onChange={(e) => setContext({ ...context, trade: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Approximate size of this package</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      value={context.projectSize} onChange={(e) => setContext({ ...context, projectSize: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under £10k">Under £10,000</option>
                      <option value="£10k–£50k">£10,000 – £50,000</option>
                      <option value="£50k–£250k">£50,000 – £250,000</option>
                      <option value="£250k+">£250,000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Expected duration</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      value={context.duration} onChange={(e) => setContext({ ...context, duration: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Under 1 month">Under 1 month</option>
                      <option value="1–3 months">1–3 months</option>
                      <option value="3–6 months">3–6 months</option>
                      <option value="6+ months">6+ months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Your role</label>
                    <select required className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      value={context.role} onChange={(e) => setContext({ ...context, role: e.target.value })}>
                      <option value="">Select...</option>
                      <option value="Subcontractor">Subcontractor to main contractor</option>
                      <option value="Sub-subcontractor">Sub-subcontractor</option>
                      <option value="Direct to client">Working direct for client</option>
                      <option value="Freelance / labour-only">Freelance / labour-only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Anything else useful? (optional)</label>
                    <textarea rows={3} placeholder="Main contractor, site, JCT/NEC, known issues..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      value={context.extra} onChange={(e) => setContext({ ...context, extra: e.target.value })} />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg">
                    Continue →
                  </button>
                </form>
              </div>
            )}

            {step === "upload" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold">Paste the contract</h1>
                  <p className="text-gray-600 text-sm mt-1">
                    Focus on payment, retention, notice, set-off and damages clauses.
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm">
                  <p className="font-medium text-blue-900 mb-1">Context we will use:</p>
                  <ul className="text-blue-800 space-y-0.5">
                    <li>Trade: {context.trade}</li>
                    <li>Size: {context.projectSize}</li>
                    <li>Duration: {context.duration}</li>
                    <li>Role: {context.role}</li>
                  </ul>
                </div>
                <div className="bg-white rounded-2xl border p-5 space-y-4">
                  <textarea
                    rows={12}
                    placeholder="Paste the relevant clauses here..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                    value={contractText}
                    onChange={(e) => setContractText(e.target.value)}
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button onClick={runReview} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg">
                    Run free first review →
                  </button>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                  <strong>Remember:</strong> This is commercial risk identification only. It is <strong>not legal advice</strong>.
                </div>
              </div>
            )}

            {step === "loading" && (
              <div className="text-center py-16 space-y-6">
                <div className="text-4xl animate-pulse">⏳</div>
                <h1 className="text-2xl font-bold">Reviewing your contract...</h1>
                <p className="text-gray-600">Checking the clauses that most often delay payment under English law.</p>
              </div>
            )}

            {step === "results" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">Your risk register</h1>
                  <button onClick={() => setStep("landing")} className="text-sm text-blue-600">New review</button>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
                  <p className="font-bold text-red-900 mb-1">IMPORTANT DISCLAIMER</p>
                  <p className="text-red-800">
                    This is commercial risk identification and suggested commercial wording only.
                    It is <strong>not legal advice</strong>. It does not create a solicitor-client relationship.
                    High-value or complex contracts should still be reviewed by a qualified construction solicitor.
                    You remain fully responsible for any changes you make. Data is not used for model training.
                  </p>
                </div>

                <div
                  className="bg-white rounded-2xl border p-5 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatResult(result) }}
                />

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
                  <h2 className="font-bold">What to do next</h2>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>Copy the suggested wording that matters most to you.</li>
                    <li>Send it as qualifications in an email or mark them on the contract.</li>
                    <li>If the contract is high value or feels complex, still speak to a construction solicitor.</li>
                    <li>Keep a record of what you requested.</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== MY REVIEWS TAB ===== */}
        {tab === "reviews" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Reviews</h1>
            {!user && (
              <p className="text-gray-600 text-sm">Log in or create an account to save and view your reviews.</p>
            )}
            {user && reviews.length === 0 && (
              <p className="text-gray-600 text-sm">No reviews yet. Run your first free review from the Home tab.</p>
            )}
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border p-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{r.trade} • {r.projectSize}</span>
                  <span className="text-gray-500">{r.date}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{r.contractPreview}</p>
                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600">View full result</summary>
                  <div
                    className="mt-3 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: formatResult(r.result) }}
                  />
                </details>
              </div>
            ))}
          </div>
        )}

        {/* ===== ABOUT TAB ===== */}
        {tab === "about" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">About GuardConstruct</h1>
            <div className="bg-white rounded-2xl border p-5 space-y-4 text-sm text-gray-700">
              <p>
                GuardConstruct helps small UK construction firms and freelancers (under 25 people)
                spot commercial payment traps before they sign a subcontract.
              </p>
              <p>
                We focus only on English law and the most common clauses that delay or reduce payment.
                This is commercial risk identification — it is <strong>not legal advice</strong>.
              </p>
              <p>
                Built for people who work on site and need a fast, practical first pass rather than
                a four-figure solicitor bill on every job.
              </p>
              <p className="text-gray-500 text-xs pt-4">
                More detail and contact information will be added here shortly.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t py-4 text-center text-xs text-gray-500 px-4">
        Commercial risk identification only. Not legal advice. Not a solicitor.
      </footer>
    </div>
  );
}