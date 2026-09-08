"use client";

import { useState } from "react";

export default function HomePage() {
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

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("upload");
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Please paste some contract text (payment, retention, notice clauses work best).");
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

      setResult(data.result);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setStep("upload");
    }
  };

  if (step === "landing") {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-4 pt-4">
          <h1 className="text-3xl font-bold leading-tight">
            Spot the payment traps<br />
            <span className="text-blue-600">before you sign</span>
          </h1>
          <p className="text-gray-600">
            Free first-pass commercial review for small UK construction firms and freelancers.
            Built for people who work on site.
          </p>
          <button
            onClick={() => setStep("context")}
            className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg"
          >
            Start free review →
          </button>
          <p className="text-xs text-gray-500">No card required • Not legal advice</p>
        </div>

        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <h2 className="font-bold text-lg">Why this exists</h2>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• Average delay in UK construction: 30+ days beyond terms</li>
            <li>• Small firms often wait 53–80 days with retention locked 12–24 months</li>
            <li>• Most delays come from contractual traps, not poor work</li>
          </ul>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-bold text-lg mb-3">The 10 traps we check</h2>
          <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
            <li>Pay-when-paid / pay-if-paid</li>
            <li>Extended or vague payment cycles</li>
            <li>Retention % and release triggers</li>
            <li>Weak notice obligations</li>
            <li>Broad set-off rights</li>
            <li>Unfair flow-down clauses</li>
            <li>Uncapped or excessive LADs</li>
            <li>Harsh conditions precedent</li>
            <li>Weak suspension rights on non-payment</li>
            <li>Vague valuation language</li>
          </ol>
        </div>
      </div>
    );
  }

  if (step === "context") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tell us about the job</h1>
          <p className="text-gray-600 text-sm mt-1">The more context, the better the review.</p>
        </div>

        <form onSubmit={handleContextSubmit} className="bg-white rounded-2xl border p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">What trade / work do you do?</label>
            <input
              required
              type="text"
              placeholder="e.g. Electrical, Groundworks, Plastering..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              value={context.trade}
              onChange={(e) => setContext({ ...context, trade: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Approximate size of this package</label>
            <select
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
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
            <label className="block text-sm font-medium mb-1">Expected duration</label>
            <select
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              value={context.role}
              onChange={(e) => setContext({ ...context, role: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="Subcontractor">Subcontractor to main contractor</option>
              <option value="Sub-subcontractor">Sub-subcontractor</option>
              <option value="Direct to client">Working direct for client</option>
              <option value="Freelance / labour-only">Freelance / labour-only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Anything else useful? (optional)</label>
            <textarea
              rows={3}
              placeholder="Main contractor, site, JCT/NEC, known issues..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              value={context.extra}
              onChange={(e) => setContext({ ...context, extra: e.target.value })}
            />
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg">
            Continue to upload →
          </button>
        </form>

        <p className="text-xs text-center text-gray-500">
          By continuing you accept this is commercial risk identification only – not legal advice.
        </p>
      </div>
    );
  }

  if (step === "upload") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Paste the contract</h1>
          <p className="text-gray-600 text-sm mt-1">
            We look only for the 10 most common payment traps under English law.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm">
          <p className="font-medium text-blue-900 mb-1">Context we will use:</p>
          <ul className="text-blue-800 space-y-0.5">
            <li>Trade: {context.trade}</li>
            <li>Size: {context.projectSize}</li>
            <li>Duration: {context.duration}</li>
            <li>Role: {context.role}</li>
            {context.extra && <li>Extra: {context.extra}</li>}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Paste contract text (best on iPad)</label>
            <textarea
              rows={12}
              placeholder="Paste the relevant payment, retention, notice, set-off and damages clauses here..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={runReview}
            className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-lg"
          >
            Run free first review →
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <strong>Remember:</strong> This is commercial risk identification only. It is <strong>not legal advice</strong>.
          High-value or complex contracts should still go to a qualified construction solicitor.
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="text-center py-16 space-y-6">
        <div className="text-4xl animate-pulse">⏳</div>
        <h1 className="text-2xl font-bold">Reviewing your contract...</h1>
        <p className="text-gray-600">
          Checking the 10 most common payment traps under English law.
          <br />Using the context you provided.
        </p>
        <div className="w-48 bg-gray-200 rounded-full h-2 mx-auto overflow-hidden">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: "70%" }}></div>
        </div>
      </div>
    );
  }

  // results
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your risk register</h1>
        <button onClick={() => setStep("landing")} className="text-sm text-blue-600">
          New review
        </button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
        <p className="font-bold text-red-900 mb-1">IMPORTANT DISCLAIMER</p>
        <p className="text-red-800">
          This is commercial risk identification and suggested commercial wording only.
          It is <strong>not legal advice</strong>. It does not create a solicitor-client relationship.
          High-value, unusual or heavily amended contracts should still be reviewed by a qualified
          construction solicitor. You remain fully responsible for any changes you make. Data is not
          used for model training.
        </p>
      </div>

      <div className="bg-white rounded-2xl border p-5 text-sm leading-relaxed whitespace-pre-wrap">
        {result}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
        <h2 className="font-bold">What to do next</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li>Copy the suggested wording that matters most to you.</li>
          <li>Send it as qualifications in an email or mark them on the contract.</li>
          <li>If the contract is high value or feels complex, still speak to a construction solicitor.</li>
          <li>Keep a record of what you requested.</li>
        </ol>
        <p className="text-xs text-gray-500 pt-2">This was your free first full review.</p>
      </div>
    </div>
  );
}