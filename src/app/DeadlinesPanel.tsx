"use client";

import { useEffect, useState } from "react";
import type { ObligationRow, JobRow, ApiError } from "@/lib/clientTypes";
import { kindLabel } from "@/lib/obligationKinds";
import { describeTiming } from "@/lib/obligationDue";
import { formatUkDate, ukToday } from "@/lib/deadlines";

const AI_WARNING =
  "Picked out by AI. They may be wrong or incomplete: check each one against the contract before you rely on it. Reminders are a convenience, not a guarantee.";

async function patchObligation(id: string, body: Record<string, unknown>): Promise<ObligationRow> {
  const res = await fetch("/api/obligations/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as { obligation?: ObligationRow } & ApiError;
  if (!res.ok || !data.obligation) throw new Error(data.error || "Could not update");
  return data.obligation;
}

function ObligationItem({
  o,
  jobName,
  canConfirm,
  onChange,
  footer,
  members = []
}: {
  o: ObligationRow;
  jobName?: string;
  canConfirm: boolean;
  onChange: (o: ObligationRow) => void;
  footer?: React.ReactNode;
  members?: Array<{ userId: string; name: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingDate, setEditingDate] = useState(false);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      onChange(await patchObligation(o.id, body));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const today = ukToday();
  const overdue = o.due_date && o.due_date < today;
  const meta = [kindLabel(o.kind), o.clause_ref ? `Clause ${o.clause_ref}` : null, jobName].filter(Boolean).join(" · ");

  return (
    <li className={`rounded-xl border p-3 space-y-2 ${o.status === "dismissed" ? "opacity-60" : ""}`}>
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900">{o.title}</p>
          <p className="text-xs text-gray-500">{meta}</p>
        </div>
        {o.status === "confirmed" && (
          <span className="shrink-0 text-[10px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">Reminders on</span>
        )}
        {o.status === "dismissed" && (
          <span className="shrink-0 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Dismissed</span>
        )}
      </div>

      <blockquote className="text-xs text-gray-600 italic border-l-2 border-gray-200 pl-2">“{o.source_quote}”</blockquote>

      <p className="text-xs text-gray-700">{describeTiming(o)}</p>

      {o.due_date && (
        <p className={`text-sm font-semibold ${overdue ? "text-gray-500 line-through" : "text-red-700"}`}>
          Due {formatUkDate(o.due_date)}
          {overdue && <span className="no-underline"> (passed)</span>}
        </p>
      )}
      {o.trigger === "event" && o.status !== "dismissed" && o.due_basis !== "manual" && (
        <label className="block text-xs text-gray-700">
          When {o.direction === "before" ? "is" : "was / is"} {o.event_description}?
          <input
            type="date"
            disabled={busy}
            className="block mt-1 rounded-lg border px-2 py-1.5 text-sm"
            defaultValue={o.event_date ?? ""}
            onChange={(e) => e.target.value && run({ eventDate: e.target.value })}
          />
        </label>
      )}

      {o.status !== "dismissed" && (
        <div className="text-xs">
          {editingDate ? (
            <span className="flex items-center gap-2">
              <input
                type="date"
                disabled={busy}
                className="rounded-lg border px-2 py-1.5 text-sm"
                defaultValue={o.due_basis === "manual" ? o.due_date ?? "" : ""}
                onChange={(e) => e.target.value && run({ dueDate: e.target.value }).then(() => setEditingDate(false))}
              />
              <button type="button" className="text-gray-500" onClick={() => setEditingDate(false)}>Cancel</button>
            </span>
          ) : o.due_basis === "manual" ? (
            <button type="button" className="text-blue-600" disabled={busy} onClick={() => run({ dueDate: null })}>
              Use the calculated date instead
            </button>
          ) : (
            <button type="button" className="text-blue-600" onClick={() => setEditingDate(true)}>
              Set the date myself
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {o.status === "suggested" && (
          <>
            <button type="button" disabled={busy || !canConfirm} onClick={() => run({ status: "confirmed" })}
              className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              Confirm &amp; remind me
            </button>
            <button type="button" disabled={busy} onClick={() => run({ status: "dismissed" })}
              className="border text-xs font-semibold px-3 py-1.5 rounded-lg">
              Not relevant
            </button>
          </>
        )}
        {o.status === "confirmed" && (
          <button type="button" disabled={busy} onClick={() => run({ status: "dismissed" })} className="border text-xs px-3 py-1.5 rounded-lg">
            Stop reminders
          </button>
        )}
        {o.status === "dismissed" && (
          <button type="button" disabled={busy} onClick={() => run({ status: "suggested" })} className="border text-xs px-3 py-1.5 rounded-lg">
            Undo
          </button>
        )}
      </div>
      {o.status === "confirmed" && members.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-gray-700">
          Reminders go to
          <select
            disabled={busy}
            className="rounded-lg border px-2 py-1 text-xs"
            value={o.assignee_id ?? ""}
            onChange={(e) => run({ assigneeId: e.target.value || null })}
          >
            <option value="">Whoever started tracking</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
        </label>
      )}
      {o.status === "confirmed" && o.trigger === "event" && !o.due_date && (
        <p className="text-xs text-amber-700">No reminder until you enter the date above.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {footer}
    </li>
  );
}

/** Deadlines extracted from one review, shown under its action plan. */
export function DeadlinesPanel({
  reviewId,
  obligations,
  job,
  canTrack,
  extraction,
  defaultJobName,
  onUpgrade,
  onObligations,
  onJob,
  members = []
}: {
  reviewId: string | null;
  obligations: ObligationRow[];
  job: JobRow | null;
  canTrack: boolean;
  extraction: "ok" | "failed" | "not_run" | null;
  defaultJobName: string;
  onUpgrade: () => void;
  onObligations: (list: ObligationRow[]) => void;
  onJob: (job: JobRow) => void;
  members?: Array<{ userId: string; name: string }>;
}) {
  const [name, setName] = useState(defaultJobName);
  const [jurisdiction, setJurisdiction] = useState("england-and-wales");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  useEffect(() => setName(defaultJobName), [defaultJobName]);

  if (!canTrack) {
    return (
      <div className="bg-white rounded-2xl border p-5 space-y-2">
        <h2 className="font-bold">Deadline reminders</h2>
        <p className="text-sm text-gray-600">
          Pro can pick the notice and payment deadlines out of your contract and email you before each one.
        </p>
        <button type="button" onClick={onUpgrade} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          Get Pro
        </button>
      </div>
    );
  }

  if (extraction === "failed") {
    return (
      <div className="bg-white rounded-2xl border p-5 text-sm text-gray-600">
        We couldn&apos;t pick out this contract&apos;s deadlines this time. The ✅ Keep track of section above still lists them.
      </div>
    );
  }
  if (!obligations.length) {
    return extraction === "ok" ? (
      <div className="bg-white rounded-2xl border p-5 text-sm text-gray-600">
        No time-limited notices with a clear period were found. Check the ✅ Keep track of section above.
      </div>
    ) : null;
  }

  const startTracking = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, name, jurisdiction })
      });
      const data = (await res.json().catch(() => ({}))) as { job?: JobRow } & ApiError;
      if (!res.ok || !data.job) throw new Error(data.error || "Could not start tracking");
      onJob(data.job);
      onObligations(obligations.map((o) => ({ ...o, job_id: data.job!.id })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start tracking");
    } finally {
      setBusy(false);
    }
  };

  const visible = obligations.filter((o) => showDismissed || o.status !== "dismissed");
  const dismissed = obligations.length - obligations.filter((o) => o.status !== "dismissed").length;

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-3">
      <h2 className="font-bold">Deadlines found in this contract ({obligations.length})</h2>
      <p className="text-xs bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-2">{AI_WARNING}</p>

      {!job ? (
        <div className="rounded-xl bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-medium">Track this job to get email reminders</p>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Job name" value={name}
            onChange={(e) => setName(e.target.value)} />
          <select className="w-full rounded-lg border px-3 py-2 text-sm" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            <option value="england-and-wales">Site in England or Wales</option>
            <option value="scotland">Site in Scotland</option>
            <option value="northern-ireland">Site in Northern Ireland</option>
          </select>
          <p className="text-[11px] text-gray-500">Used to skip the right bank holidays when counting working days.</p>
          <button type="button" disabled={busy || !name.trim() || !reviewId} onClick={startTracking}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            Start tracking
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-gray-600">Tracking as <strong>{job.name}</strong>. Confirm the deadlines you want reminders for.</p>
      )}

      <ul className="space-y-2">
        {visible.map((o) => (
          <ObligationItem key={o.id} o={o} canConfirm={!!job} members={members}
            onChange={(u) => onObligations(obligations.map((x) => (x.id === u.id ? u : x)))} />
        ))}
      </ul>
      {dismissed > 0 && (
        <button type="button" className="text-xs text-gray-500" onClick={() => setShowDismissed((v) => !v)}>
          {showDismissed ? "Hide" : "Show"} {dismissed} dismissed
        </button>
      )}
    </div>
  );
}

/** Every confirmed deadline in the workspace. */
export function DeadlinesView({
  onBack,
  onOpenReview,
  members = []
}: {
  onBack: () => void;
  onOpenReview: (id: string) => void;
  members?: Array<{ userId: string; name: string }>;
}) {
  const [obligations, setObligations] = useState<ObligationRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/deadlines", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { obligations?: ObligationRow[]; jobs?: JobRow[] } & ApiError;
      if (!res.ok) return setError(data.error || "Could not load deadlines");
      setObligations(data.obligations ?? []);
      setJobs(data.jobs ?? []);
    })();
  }, []);

  const jobName = (id: string | null) => jobs.find((j) => j.id === id)?.name;
  const today = ukToday();
  const list = obligations ?? [];
  const needsDate = list.filter((o) => !o.due_date);
  const upcoming = list.filter((o) => o.due_date && o.due_date >= today);
  const past = list.filter((o) => o.due_date && o.due_date < today);
  const update = (u: ObligationRow) =>
    setObligations((cur) => (cur ?? []).map((x) => (x.id === u.id ? u : x)).filter((x) => x.status === "confirmed"));

  const section = (title: string, items: ObligationRow[]) =>
    items.length ? (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
        <ul className="space-y-2">
          {items.map((o) => (
            <ObligationItem key={o.id} o={o} jobName={jobName(o.job_id)} canConfirm onChange={update} members={members}
              footer={
                <button type="button" className="text-xs text-blue-600" onClick={() => onOpenReview(o.review_id)}>
                  Open the contract review
                </button>
              } />
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deadlines</h1>
        <button type="button" className="text-sm text-blue-600" onClick={onBack}>Back</button>
      </div>
      <p className="text-xs bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-2">{AI_WARNING}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {obligations === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {obligations && list.length === 0 && (
        <p className="text-sm text-gray-500">No tracked deadlines yet. Run a check, then confirm the deadlines you want reminders for.</p>
      )}
      {section("Needs a date", needsDate)}
      {section("Coming up", upcoming)}
      {section("Passed", past)}
    </div>
  );
}
