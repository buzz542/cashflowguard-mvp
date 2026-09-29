"use client";

import { useState, useEffect, useRef } from "react";
import type { Me, ReviewSummary } from "@/lib/clientTypes";

export function ProfileMenu({
  me,
  onLogout,
  onManageBilling,
  reviews = [],
  onOpenReview,
  onViewAllReviews,
  onViewDeadlines,
  onToggleReminders,
  onSwitchWorkspace,
  onOpenTeam
}: {
  me: Me;
  onLogout: () => void;
  onManageBilling?: () => void;
  reviews?: ReviewSummary[];
  onOpenReview?: (id: string) => void;
  onViewAllReviews?: () => void;
  onViewDeadlines?: () => void;
  onToggleReminders?: (on: boolean) => void;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onOpenTeam?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = me.user!;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white pl-1 pr-2.5 py-1 hover:bg-gray-50 shadow-sm"
        aria-label="Account menu"
      >
        <span className="h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {initial}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-xs font-semibold text-gray-900 max-w-[100px] truncate">{user.name || "Account"}</span>
          <span className={`text-[10px] font-semibold ${me.isPro ? "text-blue-600" : "text-gray-500"}`}>
            {me.isPro ? "Pro" : "Free"}
          </span>
        </span>
      </button>

      {open && (
        // Phones: pinned under the header, full width. The avatar isn't at the screen edge, so a
        // right-anchored 288px menu used to hang ~90px off the left of a 390px screen.
        <div className="fixed left-4 right-4 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-72 max-h-[80vh] overflow-y-auto rounded-xl border bg-white shadow-lg p-3 z-50">
          <div className="flex items-center gap-3 pb-3 border-b">
            <span className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name || "Account"}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>

          {(me.workspaces?.length ?? 0) > 1 && onSwitchWorkspace && (
            <div className="py-3 border-b">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Workspace</p>
              <ul className="space-y-0.5">
                {me.workspaces!.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      disabled={w.id === me.workspace?.id}
                      onClick={() => { setOpen(false); onSwitchWorkspace(w.id); }}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-sm ${w.id === me.workspace?.id ? "bg-blue-50 text-blue-800 font-semibold" : "hover:bg-gray-50"}`}
                    >
                      {w.personal ? "Personal" : w.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="py-3 space-y-1.5 text-sm border-b">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Plan</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                  me.isPro ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-700"
                }`}
              >
                {me.isPro ? "Pro" : "Free"}
              </span>
            </div>
            {!me.isPro && me.free && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Free checks left</span>
                <span className="text-xs font-semibold text-gray-700">{me.free.remaining}</span>
              </div>
            )}
          </div>

          <div className="py-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past reviews</p>
              {onViewAllReviews && reviews.length > 0 && (
                <button type="button" className="text-[10px] text-blue-600" onClick={() => { setOpen(false); onViewAllReviews(); }}>
                  View all
                </button>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-xs text-gray-400">No reviews yet.</p>
            ) : (
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {reviews.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-gray-50"
                      onClick={() => { setOpen(false); onOpenReview?.(r.id); }}
                    >
                      <p className="text-xs font-medium text-gray-900 truncate">{r.trade || "Contract check"}</p>
                      <p className="text-[10px] text-gray-500">{new Date(r.created_at).toLocaleDateString("en-GB")}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(onViewDeadlines || onToggleReminders || onOpenTeam) && (
            <div className="py-3 border-b space-y-2">
              {onViewDeadlines && (
                <button type="button" className="block text-sm text-blue-600 font-medium" onClick={() => { setOpen(false); onViewDeadlines(); }}>
                  Deadlines I&apos;m tracking
                </button>
              )}
              {onOpenTeam && (
                <button type="button" className="block text-sm text-blue-600 font-medium" onClick={() => { setOpen(false); onOpenTeam(); }}>
                  {me.workspace && !me.workspace.personal ? "Team settings" : "Teams"}
                </button>
              )}
              {onToggleReminders && (
                <label className="flex items-center justify-between text-sm text-gray-700">
                  <span>Email reminders</span>
                  <input type="checkbox" checked={me.reminderEmails ?? true} onChange={(e) => onToggleReminders(e.target.checked)} />
                </label>
              )}
            </div>
          )}

          {onManageBilling && (
            <button
              type="button"
              onClick={() => { setOpen(false); onManageBilling(); }}
              className="w-full text-left text-sm text-blue-600 font-medium py-2 px-1 rounded-lg hover:bg-blue-50 mt-1"
            >
              Manage billing / cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full text-left text-sm text-red-600 font-medium py-2 px-1 rounded-lg hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
