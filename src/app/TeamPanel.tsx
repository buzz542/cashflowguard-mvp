"use client";

import { useCallback, useEffect, useState } from "react";
import type { Me, TeamInfo, ApiError } from "@/lib/clientTypes";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export function TeamView({
  me,
  onBack,
  onSwitch,
  onChanged
}: {
  me: Me;
  onBack: () => void;
  onSwitch: (workspaceId: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const ws = me.workspace!;
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newTeam, setNewTeam] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResult, setInviteResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const [seats, setSeats] = useState(1);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (ws.personal) return setTeam(null);
    try {
      const t = await call<TeamInfo>(`/api/workspaces/${ws.id}/members`);
      setTeam(t);
      setSeats(Math.max(t.members.length, 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the team");
    }
  }, [ws.id, ws.personal]);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const otherTeams = (me.workspaces ?? []).filter((w) => w.id !== ws.id);

  if (ws.personal) {
    return (
      <div className="bg-white rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Teams</h1>
          <button type="button" className="text-sm text-blue-600" onClick={onBack}>Back</button>
        </div>
        <p className="text-sm text-gray-600">
          A team workspace shares contract reviews and tracked deadlines between the people in your firm. Pro is bought
          per seat for the team.
        </p>
        {otherTeams.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Your teams</p>
            {otherTeams.map((w) => (
              <button key={w.id} type="button" disabled={busy} onClick={() => act(() => onSwitch(w.id))}
                className="w-full text-left rounded-xl border px-4 py-3 hover:bg-gray-50 text-sm">
                {w.name} <span className="text-gray-500">· {w.role === "owner" ? "Owner" : "Member"}</span>
              </button>
            ))}
          </div>
        )}
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await call("/api/workspaces", { method: "POST", body: JSON.stringify({ name: newTeam }) });
            setNewTeam("");
            await onChanged();
          });
        }}>
          <p className="text-sm font-semibold">Create a team</p>
          <input className="w-full rounded-lg border px-3 py-2.5 text-sm" placeholder="Company or team name" value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)} required maxLength={80} />
          <button type="submit" disabled={busy || !newTeam.trim()} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
            Create team
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const isOwner = ws.role === "owner";
  const personal = (me.workspaces ?? []).find((w) => w.personal);

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold truncate">{ws.name}</h1>
        <button type="button" className="text-sm text-blue-600 shrink-0" onClick={onBack}>Back</button>
      </div>

      {team && (
        <p className="text-sm text-gray-600">
          {team.seats.compPro
            ? "Complimentary Pro for everyone in this team."
            : team.seats.subscriptionActive
              ? `${Math.min(team.seats.used, team.seats.paid)} of ${team.seats.paid} paid seats in use.`
              : "No team plan yet: members use their own free check."}
          {team.seats.subscriptionActive && team.seats.used > team.seats.paid && (
            <span className="text-amber-700"> {team.seats.used - team.seats.paid} member(s) have no seat. Add seats in Manage billing.</span>
          )}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">People</p>
        <ul className="space-y-2">
          {(team?.members ?? []).map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.name}{m.userId === me.user?.id ? " (you)" : ""}</p>
                <p className="text-xs text-gray-500 truncate">{m.email} · {m.role === "owner" ? "Owner" : "Member"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${m.hasSeat ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {m.hasSeat ? "Pro seat" : "No seat"}
                </span>
                {isOwner && m.role !== "owner" && (
                  <button type="button" disabled={busy} className="text-xs text-blue-600"
                    onClick={() => {
                      if (!confirm(`Make ${m.name} the owner of ${ws.name}? You'll stay in the team as a member.`)) return;
                      void act(async () => {
                        await call(`/api/workspaces/${ws.id}/transfer`, { method: "POST", body: JSON.stringify({ userId: m.userId }) });
                        await onChanged();
                        await load();
                      });
                    }}>
                    Make owner
                  </button>
                )}
                {m.role !== "owner" && (isOwner || m.userId === me.user?.id) && (
                  <button type="button" disabled={busy} className="text-xs text-red-600"
                    onClick={() => {
                      const leaving = m.userId === me.user?.id;
                      if (!confirm(leaving ? "Leave this team?" : `Remove ${m.name} from the team?`)) return;
                      void act(async () => {
                        await call(`/api/workspaces/${ws.id}/members/${m.userId}`, { method: "DELETE" });
                        if (leaving && personal) await onSwitch(personal.id);
                        else await load();
                      });
                    }}>
                    {m.userId === me.user?.id ? "Leave" : "Remove"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isOwner && (
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            const r = await call<{ link: string; emailed: boolean }>(`/api/workspaces/${ws.id}/invites`, {
              method: "POST", body: JSON.stringify({ email: inviteEmail })
            });
            setInviteResult({ ...r, email: inviteEmail.trim().toLowerCase() });
            setInviteEmail("");
            setCopied(false);
            await load();
          });
        }}>
          <p className="text-sm font-semibold">Invite someone</p>
          <div className="flex gap-2">
            <input type="email" required className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm" placeholder="their@email.co.uk"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <button type="submit" disabled={busy} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50">Invite</button>
          </div>
          {inviteResult && (
            <div className="text-xs bg-gray-50 rounded-lg p-2 space-y-1">
              <p>
                {inviteResult.emailed ? `Invite emailed to ${inviteResult.email}.` : `We couldn't email ${inviteResult.email}. Send them this link yourself:`}
                {" "}It only works for that address. This is the only time the link is shown.
              </p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 min-w-0 truncate">{inviteResult.link}</code>
                <button type="button" className="text-blue-600 shrink-0" onClick={async () => {
                  try { await navigator.clipboard.writeText(inviteResult.link); setCopied(true); } catch { /* ignore */ }
                }}>{copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
          )}
          {(team?.invites.length ?? 0) > 0 && (
            <ul className="space-y-1">
              {team!.invites.map((i) => (
                <li key={i.id} className="flex justify-between text-xs text-gray-600">
                  <span className="truncate">{i.email} · invited, expires {new Date(i.expires_at).toLocaleDateString("en-GB")}</span>
                  <button type="button" className="text-red-600 shrink-0" disabled={busy}
                    onClick={() => act(async () => { await call(`/api/workspaces/${ws.id}/invites/${i.id}`, { method: "DELETE" }); await load(); })}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {isOwner && team && !team.seats.compPro && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Team plan</p>
          {team.seats.subscriptionActive ? (
            <button type="button" disabled={busy} className="border text-sm font-semibold px-4 py-2 rounded-lg"
              onClick={() => act(async () => {
                const r = await call<{ url: string }>("/api/portal", { method: "POST" });
                window.location.href = r.url;
              })}>
              Manage billing / change seats
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min={Math.max(1, team.members.length)} max={team.seats.max} value={seats}
                onChange={(e) => setSeats(Number(e.target.value))} className="w-20 rounded-lg border px-2 py-2 text-sm" aria-label="Seats" />
              <button type="button" disabled={busy} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                onClick={() => act(async () => {
                  const r = await call<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ seats }) });
                  window.location.href = r.url;
                })}>
                Buy {seats} seat{seats === 1 ? "" : "s"}
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">Seats go to the owner first, then people in the order they joined.</p>
        </div>
      )}

      {personal && (
        <button type="button" className="text-sm text-blue-600" disabled={busy} onClick={() => act(() => onSwitch(personal.id))}>
          Switch to my personal workspace
        </button>
      )}
      {isOwner && (
        <div className="border-t pt-4">
          <button type="button" disabled={busy} className="text-sm text-red-600"
            onClick={() => {
              const typed = window.prompt(`This deletes ${ws.name} and all its reviews and tracked deadlines for everyone in it. Type the team name to confirm.`);
              if (typed !== ws.name) return;
              void act(async () => {
                await call(`/api/workspaces/${ws.id}`, { method: "DELETE", body: JSON.stringify({ confirm: typed }) });
                if (personal) await onSwitch(personal.id);
              });
            }}>
            Delete this team
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
