"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { SidebarNav } from "./sidebar-nav";

type Props = {
  signedIn: boolean;
  guildRole: "admin" | "member" | null;
  isSuperAdmin: boolean;
  guildName: string | null;
};

export function MobileNav({ signedIn, guildRole, isSuperAdmin, guildName }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close when the route changes (after a nav link tap).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="grid size-9 place-items-center rounded-md text-gray-700 hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-900"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path
            d="M3 6h14M3 10h14M3 14h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-5 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <BrandMark size={32} />
                <div className="leading-tight">
                  <div className="text-sm font-bold tracking-wider text-gray-900 dark:text-gray-100">
                    RALLY UP
                  </div>
                  <div className="text-[10px] font-medium tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    FOUNDATION GALACTIC FRONTIER
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav
                signedIn={signedIn}
                guildRole={guildRole}
                isSuperAdmin={isSuperAdmin}
                hasGuild={!!guildName}
              />
            </div>

            {guildName && (
              <div className="m-4 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-center dark:border-violet-900/60 dark:bg-violet-950/40">
                <div className="text-[10px] font-medium tracking-[0.2em] text-violet-600 dark:text-violet-300">
                  GUILD
                </div>
                <div className="mt-1 text-sm font-bold tracking-wider text-violet-900 dark:text-violet-100">
                  {guildName.toUpperCase()}
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
