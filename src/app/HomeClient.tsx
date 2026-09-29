"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReviewResults from "./ReviewResults";
import { ProfileMenu } from "./ProfileMenu";
import { AuthModal, TermsGate } from "./AuthModal";
import { DeadlinesPanel, DeadlinesView } from "./DeadlinesPanel";
import { TeamView } from "./TeamPanel";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Me, ReviewSummary, ApiError, ObligationRow, JobRow, TeamInfo } from "@/lib/clientTypes";

type Step = "landing" | "context" | "upload" | "loading" | "results" | "history" | "deadlines" | "team";
type Assignable = { userId: string; name: string };
const INVITE_KEY = "gc_invite";
type Extraction = "ok" | "failed" | "not_run" | null;

/** Pre-accounts, reviews lived in localStorage under this key. */
const legacyReviewsKey = (email: string) => "gc_reviews_" + email.toLowerCase();

function FooterLinks() {
  return (
    <footer className="border-t py-8 text-center text-xs text-gray-500 space-y-2">
      <p>GuardConstruct · Not legal advice · Automated AI summaries only</p>
      <p className="space-x-3">
        <Link href="/privacy" className="text-blue-600 hover:underline">Privacy</Link>
        <Link href="/terms" className="text-blue-600 hover:underline">Terms</Link>
        <a href="mailto:tobyburrows1@icloud.com" className="text-blue-600 hover:underline">Report a problem</a>
      </p>
    </footer>
  );
}

async function readJson<T>(res: Response): Promise<T & ApiError> {
  return (await res.json().catch(() => ({}))) as T & ApiError;
}

export default function HomeClient({ freeLimit, remindersProOnly }: { freeLimit: number; remindersProOnly: boolean }) {
  const [view, setView] = useState<"marketing" | "app">("marketing");
  const [me, setMe] = useState<Me | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [afterTerms, setAfterTerms] = useState<"check" | "run" | null>(null);
  const [step, setStep] = useState<Step>("landing");
  const [context, setContext] = useState({ trade: "", projectSize: "", duration: "", role: "" });
  const [contractText, setContractText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewTrade, setReviewTrade] = useState("");
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [job, setJob] = useState<JobRow | null>(null);
  const [extraction, setExtraction] = useState<Extraction>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [teamMembers, setTeamMembers] = useState<Assignable[]>([]);
  const [inviteTick, setInviteTick] = useState(0);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const user = me?.user ?? null;
  const termsVersion = me?.termsVersion ?? "";

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await readJson<Me>(res);
      if (!res.ok) throw new Error(data.error || "Could not load account");
      setMe(data);
      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, []);

  const refreshReviews = useCallback(async () => {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    if (!res.ok) return;
    const data = await readJson<{ reviews: ReviewSummary[] }>(res);
    setReviews(data.reviews ?? []);
  }, []);

  // Session bootstrap + keep in sync with Supabase auth events.
  useEffect(() => {
    // The pre-accounts version kept password hashes in localStorage. Remove them.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && /^gc_user(_|$)/.test(k)) localStorage.removeItem(k);
      }
    } catch {
      /* storage unavailable */
    }

    void refreshMe();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void refreshMe();
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshMe]);

  // Load history, and look for pre-accounts reviews on this device for this email.
  const userId = user?.id;
  const userEmail = user?.email;
  useEffect(() => {
    if (!userId || !userEmail) {
      setReviews([]);
      setLegacyCount(0);
      return;
    }
    void refreshReviews();
    try {
      const raw = localStorage.getItem(legacyReviewsKey(userEmail));
      const parsed = raw ? JSON.parse(raw) : [];
      setLegacyCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setLegacyCount(0);
    }
  }, [userId, userEmail, refreshReviews]);

  // Teammates, for assigning deadlines (team workspaces only).
  const workspaceId = me?.workspace?.id;
  const workspacePersonal = me?.workspace?.personal ?? true;
  useEffect(() => {
    if (!workspaceId || workspacePersonal) return setTeamMembers([]);
    (async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, { cache: "no-store" });
      if (!res.ok) return;
      const t = await readJson<TeamInfo>(res);
      setTeamMembers((t.members ?? []).map((m) => ({ userId: m.userId, name: m.name })));
    })();
  }, [workspaceId, workspacePersonal]);

  const switchWorkspace = useCallback(
    async (id: string) => {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id })
      });
      if (!res.ok) {
        setBanner((await readJson<object>(res)).error || "Could not switch workspace");
        return;
      }
      const fresh = await refreshMe();
      await refreshReviews();
      setView("app");
      setStep("landing");
      if (fresh?.workspace) setBanner(`Now working in ${fresh.workspace.personal ? "your personal workspace" : fresh.workspace.name}.`);
    },
    [refreshMe, refreshReviews]
  );

  // Team invite links (/?invite=TOKEN): keep the token until the user is signed in, then accept.
  useEffect(() => {
    if (!userId) return;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(INVITE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (!token) return;
    (async () => {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await readJson<{ workspaceId: string }>(res);
      // Keep the token if it was sent to a different address, so they can log in with the right one.
      if (data.code !== "email_mismatch") {
        try { sessionStorage.removeItem(INVITE_KEY); } catch { /* ignore */ }
      }
      if (!res.ok) return setBanner(data.error || "Could not accept the invite.");
      const fresh = await refreshMe();
      await refreshReviews();
      setView("app");
      setStep("landing");
      setBanner(`You've joined ${fresh?.workspace?.name ?? "the team"}.`);
    })();
  }, [userId, inviteTick, refreshMe, refreshReviews]);

  // Return from magic link / email confirmation / Stripe Checkout / team invite.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");
    const invite = params.get("invite");
    if (!auth && !checkout && !invite) return;
    window.history.replaceState({}, "", window.location.pathname);

    if (invite) {
      try { sessionStorage.setItem(INVITE_KEY, invite); } catch { /* ignore */ }
      setInviteTick((t) => t + 1);
      setBanner("You've been invited to a team. Log in or create an account with the email address the invite was sent to.");
    }

    if (auth === "ok") {
      setView("app");
      setStep("landing");
    } else if (auth === "error") {
      setBanner("That login link didn't work or has expired. Please request a new one.");
    }

    if (checkout === "success" && sessionId) {
      (async () => {
        const res = await fetch("/api/checkout/verify?session_id=" + encodeURIComponent(sessionId));
        const data = await readJson<{ pro: boolean }>(res);
        await refreshMe();
        setView("app");
        setStep("landing");
        setBanner(
          res.ok && data.pro
            ? "You're on Pro. Thanks for subscribing."
            : "Payment received. Your Pro access may take a minute to appear. Refresh if it doesn't."
        );
      })();
    }
  }, [refreshMe]);

  const logout = async () => {
    await getSupabaseBrowser()?.auth.signOut();
    setMe((m) => (m ? { accountsEnabled: m.accountsEnabled, user: null } : m));
    setView("marketing");
    setStep("landing");
  };

  const startCheckout = async () => {
    setCheckoutLoading(true);
    setSubscribeError("");
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await readJson<{ url: string }>(res);
      if (res.status === 401) {
        setPendingCheckout(true);
        setAuthMode("signup");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: unknown) {
      setSubscribeError(err instanceof Error ? err.message : "Checkout failed");
      setShowSubscribe(true);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = await readJson<{ url: string }>(res);
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open billing");
      window.location.href = data.url;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not open billing portal");
    }
  };

  const onAuthDone = async () => {
    setAuthMode(null);
    const fresh = await refreshMe();
    if (pendingCheckout) {
      setPendingCheckout(false);
      if (fresh?.isPro) {
        setView("app");
        setStep("landing");
      } else {
        void startCheckout();
      }
      return;
    }
    setView("app");
    setStep("landing");
  };

  const goPro = () => {
    if (me?.isPro) {
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
    if (!me?.termsAccepted) {
      setAfterTerms("check");
      setShowTerms(true);
      return;
    }
    if (!me.isPro && (me.free?.remaining ?? 0) <= 0) {
      setShowSubscribe(true);
      return;
    }
    setContractText("");
    setPages([]);
    setError("");
    setView("app");
    setStep("context");
  };

  const openPastReviews = () => {
    if (!user) {
      setAuthMode("login");
      return;
    }
    void refreshReviews();
    setView("app");
    setStep("history");
  };

  const openReview = async (id: string) => {
    setError("");
    const res = await fetch("/api/reviews/" + encodeURIComponent(id), { cache: "no-store" });
    const data = await readJson<{
      review: { id: string; result_md: string; trade: string | null; extraction_status: Extraction };
      obligations: ObligationRow[];
      job: JobRow | null;
    }>(res);
    if (!res.ok || !data.review) {
      setBanner(data.error || "Could not open that review.");
      return;
    }
    setResult(data.review.result_md);
    setReviewId(data.review.id);
    setReviewTrade(data.review.trade || "");
    setObligations(data.obligations ?? []);
    setJob(data.job ?? null);
    setExtraction(data.review.extraction_status ?? null);
    setView("app");
    setStep("results");
  };

  const toggleReminderEmails = async (on: boolean) => {
    const res = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderEmails: on })
    });
    if (res.ok) setMe((m) => (m ? { ...m, reminderEmails: on } : m));
  };

  const deleteReview = async (id: string) => {
    if (!confirm("Delete this review? This can't be undone.")) return;
    const res = await fetch("/api/reviews/" + encodeURIComponent(id), { method: "DELETE" });
    const data = await readJson<{ ok: boolean }>(res);
    if (!res.ok) {
      alert(data.error || "Could not delete");
      return;
    }
    setReviews((list) => list.filter((r) => r.id !== id));
  };

  const importLegacy = async () => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(legacyReviewsKey(user.email));
      const list = raw ? JSON.parse(raw) : [];
      const res = await fetch("/api/reviews/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: list })
      });
      const data = await readJson<{ imported: number }>(res);
      if (!res.ok) throw new Error(data.error || "Import failed");
      localStorage.removeItem(legacyReviewsKey(user.email));
      setLegacyCount(0);
      setBanner(`Imported ${data.imported} review${data.imported === 1 ? "" : "s"} into your account.`);
      void refreshReviews();
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : "Import failed");
    }
  };

  const discardLegacy = () => {
    if (!user || !confirm("Remove the reviews saved on this device without importing them?")) return;
    localStorage.removeItem(legacyReviewsKey(user.email));
    setLegacyCount(0);
  };

  const processFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setExtracting(true);
    setError("");
    let combined = contractText;
    const names = [...pages];
    const failed: string[] = [];
    for (const file of Array.from(files).slice(0, 12)) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        if (res.status === 413) throw new Error("File is too large to upload. Try a smaller photo or PDF.");
        const data = await readJson<{ text: string; fileName: string }>(res);
        if (!res.ok) throw new Error(data.error || "Could not read file");
        const text = (data.text || "").trim();
        if (!text) continue;
        const label = data.fileName || file.name;
        combined = combined ? combined + "\n\n--- " + label + " ---\n\n" + text : text;
        names.push(label);
      } catch (err: unknown) {
        // Keep going: one bad page shouldn't throw away the pages that did work.
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setContractText(combined);
    setPages(names);
    if (failed.length) setError(failed.join("\n"));
    setExtracting(false);
    if (photoRef.current) photoRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  };

  const runReview = async () => {
    if (!contractText.trim()) {
      alert("Add a photo, PDF, Word file, or paste text.");
      return;
    }
    setError("");
    setStep("loading");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, contractText })
      });
      const data = await readJson<{
        result: string;
        saved: boolean;
        reviewId: string | null;
        obligations: ObligationRow[];
        extraction: Extraction;
      }>(res);
      if (!res.ok) {
        setStep("upload");
        if (data.code === "upgrade_required") return setShowSubscribe(true);
        if (data.code === "terms_required") {
          setAfterTerms("run");
          return setShowTerms(true);
        }
        if (data.code === "unauthenticated") return setAuthMode("login");
        throw new Error(data.error || "Review failed");
      }
      setResult(data.result);
      setReviewId(data.reviewId);
      setReviewTrade(context.trade);
      setObligations(data.obligations ?? []);
      setJob(null);
      setExtraction(data.extraction ?? null);
      if (!data.saved) setBanner("Your review is below, but we couldn't save it to your history. Copy anything you need.");
      setStep("results");
      void refreshMe();
      void refreshReviews();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("upload");
    }
  };

  const scrollTo = (id: string) => {
    setView("marketing");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const navBar = (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <button type="button" className="flex items-center gap-2 shrink-0" onClick={() => { setView("marketing"); setStep("landing"); }}>
          <img src="/logo.svg" alt="GuardConstruct logo" className="h-8 w-auto" />
          <span className="font-bold hidden sm:inline">Guard<span className="text-blue-600">Construct</span></span>
        </button>
        <nav className="hidden md:flex items-center gap-5 text-sm text-gray-600">
          <button type="button" className="hover:text-gray-900" onClick={() => scrollTo("how")}>How it works</button>
          <button type="button" className="hover:text-gray-900" onClick={() => scrollTo("features")}>Features</button>
          <button type="button" className="hover:text-gray-900" onClick={() => scrollTo("pricing")}>Pricing</button>
          <button type="button" className="hover:text-gray-900" onClick={openPastReviews}>Past reviews</button>
          {user && (
            <button type="button" className="hover:text-gray-900" onClick={() => { setView("app"); setStep("deadlines"); }}>Deadlines</button>
          )}
          <button type="button" className="hover:text-gray-900" onClick={() => scrollTo("roadmap")}>Roadmap</button>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {user && me ? (
            <ProfileMenu
              me={me}
              onLogout={logout}
              onManageBilling={me.canManageBilling ? openBillingPortal : undefined}
              reviews={reviews}
              onOpenReview={openReview}
              onViewAllReviews={openPastReviews}
              onViewDeadlines={() => { setView("app"); setStep("deadlines"); }}
              onToggleReminders={me.canTrackDeadlines ? toggleReminderEmails : undefined}
              onSwitchWorkspace={switchWorkspace}
              onOpenTeam={() => { setView("app"); setStep("team"); }}
            />
          ) : (
            <button type="button" onClick={() => setAuthMode("login")} className="text-sm text-gray-600">Log in</button>
          )}
          <button type="button" onClick={startCheck} className="bg-blue-600 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg">
            Check a document
          </button>
        </div>
      </div>
    </header>
  );

  const bannerEl = banner ? (
    <div className="bg-blue-50 border-b border-blue-100 text-sm text-blue-900">
      <div className="max-w-2xl mx-auto px-4 py-2 flex justify-between gap-3">
        <span>{banner}</span>
        <button type="button" className="text-blue-700" onClick={() => setBanner("")} aria-label="Dismiss">×</button>
      </div>
    </div>
  ) : null;

  if (authMode) {
    return (
      <AuthModal
        mode={authMode}
        setMode={setAuthMode}
        termsVersion={termsVersion}
        forCheckout={pendingCheckout}
        onDone={onAuthDone}
        onCancel={() => { setAuthMode(null); setPendingCheckout(false); }}
      />
    );
  }

  if (showTerms) {
    return (
      <TermsGate
        termsVersion={termsVersion}
        onCancel={() => { setShowTerms(false); setAfterTerms(null); }}
        onAccepted={async () => {
          setShowTerms(false);
          const next = afterTerms;
          setAfterTerms(null);
          await refreshMe();
          if (next === "run") void runReview();
          else if (next === "check") {
            setContractText("");
            setPages([]);
            setError("");
            setView("app");
            setStep("context");
          }
        }}
      />
    );
  }

  if (showSubscribe) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black/40">
        <div className="bg-white rounded-2xl border p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">Upgrade to Pro</h1>
          <p className="text-sm text-gray-600 text-center">
            You&apos;ve used your free check. Pro is £19/month for unlimited checks. Cancel any time in Manage billing.
          </p>
          {subscribeError && <p className="text-sm text-red-600">{subscribeError}</p>}
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
      <div className="min-h-screen flex flex-col bg-white">
        {navBar}
        {bannerEl}

        <section className="max-w-3xl mx-auto px-4 pt-16 pb-14 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase mb-5">Cash flow protection</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Before you sign it,<br />know what it means.
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Photograph or upload a construction contract. Get plain-English payment
            risks under English law — so you get paid on time, not left chasing retention
            and pay-when-paid clauses.
          </p>
          <button type="button" onClick={startCheck} className="mt-8 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl">
            Check a document — free first pass
          </button>
          <p className="mt-4 text-xs text-gray-500">Built for UK subcontractors and freelancers under 25 staff. Not legal advice.</p>
        </section>

        <section className="border-y bg-[#FAFAF9] py-10">
          <p className="text-center text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-4">Trusted by early UK contractors</p>
          <div className="max-w-4xl mx-auto px-4 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-500">
            <span>Framing · Groundworks</span>
            <span>Electrical · Plumbing</span>
            <span>Joinery · M&E</span>
            <span>Fit-out · Civils</span>
          </div>
        </section>

        <section id="how" className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { n: "1", t: "Add context", d: "Trade, package size, role and duration — so the check is weighted to your job." },
              { n: "2", t: "Upload the contract", d: "Photo, PDF or Word. Multiple pages supported." },
              { n: "3", t: "Get an action plan", d: "Plain-English payment risks and suggested wording you can send before you sign." }
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border p-5 bg-white">
                <p className="text-blue-600 font-bold text-sm mb-2">Step {x.n}</p>
                <h3 className="font-semibold text-lg mb-2">{x.t}</h3>
                <p className="text-sm text-gray-600">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="bg-[#FAFAF9] border-y py-16">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-center mb-10">Features</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                "Built around English construction payment traps (JCT / NEC style patterns)",
                "Retention, pay-when-paid, notice deadlines, LADs and set-off flagged in plain English",
                "Suggested wording you can copy into an email or message",
                "Past contract reviews saved to your account, on any device",
                `Email reminders before notice and payment deadlines${remindersProOnly ? " (Pro)" : ""}`,
                "Photo, PDF and Word upload",
                "Pro plan for unlimited checks",
                "Team workspaces: shared reviews and deadlines, Pro per seat"
              ].map((f) => (
                <div key={f} className="flex gap-3 bg-white rounded-xl border p-4 text-sm text-gray-700">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-center mb-10">Pricing</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border p-6">
              <p className="text-sm font-semibold text-gray-500 uppercase">Free</p>
              <p className="text-3xl font-bold mt-1">£0</p>
              <p className="text-sm text-gray-600 mt-1 mb-4">
                {freeLimit === 1 ? "One document check" : `${freeLimit} document checks`}
              </p>
              <button type="button" onClick={startCheck} className="w-full border font-semibold py-2.5 rounded-xl">Start free check</button>
            </div>
            <div className="rounded-2xl border-2 border-blue-600 p-6">
              <p className="text-sm font-semibold text-gray-500 uppercase">Pro</p>
              <p className="text-3xl font-bold mt-1">£19<span className="text-base text-gray-500">/month</span></p>
              <p className="text-sm text-gray-600 mt-1 mb-4">Unlimited checks · Cancel any time</p>
              <button type="button" onClick={goPro} disabled={checkoutLoading}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60">
                {checkoutLoading ? "Opening Stripe…" : me?.isPro ? "You’re on Pro" : "Get Pro — £19/month"}
              </button>
            </div>
          </div>
        </section>

        <section id="roadmap" className="bg-[#FAFAF9] border-t py-16">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Roadmap</h2>
            <p className="text-gray-600 text-sm mb-8">What we’re building next for small UK contractors.</p>
            <ul className="text-left space-y-3 text-sm text-gray-700 max-w-md mx-auto">
              <li className="bg-white border rounded-xl px-4 py-3">✓ Live: contract photo / PDF / Word checks</li>
              <li className="bg-white border rounded-xl px-4 py-3">✓ Live: action plan + suggested wording</li>
              <li className="bg-white border rounded-xl px-4 py-3">✓ Live: history across devices</li>
              <li className="bg-white border rounded-xl px-4 py-3">✓ Live: notice deadline reminders</li>
              <li className="bg-white border rounded-xl px-4 py-3">✓ Live: team seats for small firms</li>
            </ul>
          </div>
        </section>

        <FooterLinks />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9]">
      {navBar}
      {bannerEl}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {step === "landing" && (
          <div className="space-y-4">
            {legacyCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm space-y-2">
                <p className="font-semibold text-amber-950">
                  {legacyCount} review{legacyCount === 1 ? "" : "s"} saved on this device
                </p>
                <p className="text-amber-900">
                  These are from before accounts. Import them so you can see them on any device.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={importLegacy} className="bg-amber-600 text-white font-semibold px-3 py-1.5 rounded-lg">Import</button>
                  <button type="button" onClick={discardLegacy} className="text-amber-900 px-3 py-1.5">Discard</button>
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl border p-5 space-y-3">
              <h1 className="text-2xl font-bold">Check a document</h1>
              {user && (
                <p className="text-sm text-gray-600">
                  Signed in as <strong>{user.email}</strong> · Plan:{" "}
                  <strong className={me?.isPro ? "text-blue-600" : ""}>{me?.isPro ? "Pro" : "Free"}</strong>
                  {!me?.isPro && me?.free && <> · {me.free.remaining} free check{me.free.remaining === 1 ? "" : "s"} left</>}
                </p>
              )}
              {me?.workspace && !me.workspace.personal && (
                <p className="text-sm text-gray-600">
                  Team: <strong>{me.workspace.name}</strong>. Reviews and deadlines here are shared with your team.
                </p>
              )}
              <button type="button" onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
                Start a new check →
              </button>
              <button type="button" onClick={openPastReviews} className="w-full border font-semibold py-3 rounded-xl text-sm">
                Past contract reviews
              </button>
              <button type="button" onClick={() => setStep("deadlines")} className="w-full border font-semibold py-3 rounded-xl text-sm">
                Deadlines I&apos;m tracking
              </button>
              <button type="button" onClick={() => setStep("team")} className="w-full border font-semibold py-3 rounded-xl text-sm">
                {me?.workspace && !me.workspace.personal ? "Team settings" : "Teams"}
              </button>
            </div>
          </div>
        )}

        {step === "deadlines" && (
          <DeadlinesView onBack={() => setStep("landing")} onOpenReview={openReview} members={teamMembers} />
        )}

        {step === "team" && me?.workspace && (
          <TeamView
            me={me}
            onBack={() => setStep("landing")}
            onSwitch={switchWorkspace}
            onChanged={async () => {
              await refreshMe();
              await refreshReviews();
            }}
          />
        )}

        {step === "history" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Past contract reviews</h1>
              <button type="button" className="text-sm text-blue-600" onClick={() => setStep("landing")}>Back</button>
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">No reviews yet.</p>
            ) : (
              <ul className="space-y-2">
                {reviews.map((r) => (
                  <li key={r.id} className="flex gap-2 items-stretch">
                    <button type="button" onClick={() => openReview(r.id)} className="flex-1 text-left rounded-xl border px-4 py-3 hover:bg-gray-50">
                      <p className="font-medium text-sm">{r.trade || "Contract check"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(r.created_at).toLocaleString("en-GB")} · {r.role || "—"}
                      </p>
                    </button>
                    {(r.author_id === user?.id || me?.workspace?.role === "owner") && (
                      <button type="button" onClick={() => deleteReview(r.id)}
                        className="text-xs text-red-600 border rounded-xl px-3 hover:bg-red-50" aria-label="Delete review">
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === "context" && (
          <form onSubmit={(e) => { e.preventDefault(); setStep("upload"); }} className="bg-white rounded-2xl border p-5 space-y-4">
            <h1 className="text-2xl font-bold">About this job</h1>
            <input required placeholder="Trade / work" className="w-full rounded-lg border px-3 py-2.5"
              value={context.trade} onChange={(e) => setContext({ ...context, trade: e.target.value })} />
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.projectSize}
              onChange={(e) => setContext({ ...context, projectSize: e.target.value })}>
              <option value="">Package size</option>
              <option value="Under £10k">Under £10,000</option>
              <option value="£10k–£50k">£10,000 – £50,000</option>
              <option value="£50k–£250k">£50,000 – £250,000</option>
              <option value="£250k+">£250,000+</option>
            </select>
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.duration}
              onChange={(e) => setContext({ ...context, duration: e.target.value })}>
              <option value="">Duration</option>
              <option value="Under 1 month">Under 1 month</option>
              <option value="1–3 months">1–3 months</option>
              <option value="3–6 months">3–6 months</option>
              <option value="6+ months">6+ months</option>
            </select>
            <select required className="w-full rounded-lg border px-3 py-2.5" value={context.role}
              onChange={(e) => setContext({ ...context, role: e.target.value })}>
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
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => processFiles(e.target.files)} />
            <input ref={fileRef} type="file" multiple
              accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,image/*"
              className="hidden" onChange={(e) => processFiles(e.target.files)} />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={extracting} onClick={() => photoRef.current?.click()}
                className="border-2 border-dashed rounded-xl py-5 text-sm font-medium">
                {extracting ? "Reading…" : "📷 Take photo"}
              </button>
              <button type="button" disabled={extracting} onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-xl py-5 text-sm font-medium">
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
            <textarea rows={4} placeholder="Or paste contract text…" className="w-full rounded-lg border px-3 py-2.5 text-sm"
              value={contractText} onChange={(e) => setContractText(e.target.value)} />
            {error && <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>}
            <button type="button" onClick={runReview} disabled={extracting || !contractText.trim()}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50">
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
              <button type="button" className="text-sm text-blue-600" onClick={() => setStep("landing")}>Done</button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
              <p className="font-bold text-red-900">Not legal advice</p>
              <p className="text-red-800">Commercial risk identification only. Generated by AI — may be incomplete or wrong.</p>
            </div>
            <div className="bg-white rounded-2xl border p-5">
              <ReviewResults result={result} />
            </div>
            <DeadlinesPanel
              reviewId={reviewId}
              obligations={obligations}
              job={job}
              canTrack={!!me?.canTrackDeadlines}
              extraction={extraction}
              defaultJobName={reviewTrade || "Contract"}
              onUpgrade={() => setShowSubscribe(true)}
              onObligations={setObligations}
              onJob={setJob}
              members={teamMembers}
            />
            <button type="button" onClick={startCheck} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl">
              Start another check →
            </button>
          </div>
        )}
      </main>
      <FooterLinks />
    </div>
  );
}
