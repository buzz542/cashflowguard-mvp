"use client";

import { useState, useEffect, useRef } from "react";

export type User = {
  email: string;
  password: string;
  freeUsed: boolean;
  isPro?: boolean;
  name?: string;
};

export const PRO_ACCOUNTS: Record<string, string> = {
  "tobyburrows1@icloud.com": "Toby Burrows"
};

export function isProEmail(email: string) {
  return Object.prototype.hasOwnProperty.call(PRO_ACCOUNTS, email.toLowerCase());
}

export function withEntitlements(u: User): User {
  const email = u.email.toLowerCase();
  if (isProEmail(email)) {
    return {
      ...u,
      email,
      isPro: true,
      freeUsed: false,
      name: u.name || PRO_ACCOUNTS[email] || email.split("@")[0]
    };
  }
  return { ...u, email, name: u.name || email.split("@")[0] };
}

export function ProfileMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white pl-1 pr-2.5 py-1 hover:bg-gray-50"
        aria-label="Account menu"
      >
        <span className="h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {initial}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-xs font-semibold text-gray-900 max-w-[120px] truncate">
            {user.name || "Account"}
          </span>
          <span className="text-[10px] text-gray-500">{user.isPro ? "Pro" : "Free"}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-white shadow-lg p-3 z-50">
          <div className="flex items-center gap-3 pb-3 border-b">
            <span className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name || "Account"}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <div className="py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className={`font-semibold ${user.isPro ? "text-blue-600" : "text-gray-800"}`}>
                {user.isPro ? "Pro" : "Free"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">Email</span>
              <span className="font-medium text-gray-800 text-right truncate">{user.email}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">Name</span>
              <span className="font-medium text-gray-800 text-right truncate">{user.name || "—"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full text-left text-sm text-red-600 font-medium py-2 px-1 rounded-lg hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
