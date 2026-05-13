"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { UserAlert } from "@/lib/user-alerts";

// Bell icon in the top bar that surfaces actionable alerts (currently
// just "Discord not linked" for Google-signup users). Hidden entirely
// when there are no alerts — no point in a visual element with no
// content. When there ARE alerts: shows a violet dot indicator and
// opens a small dropdown listing them on click.
//
// All rendering is client-side because the dropdown needs open/close
// state + click-outside dismissal. The alert *data* is computed
// server-side in computeUserAlerts and passed as a prop.
export function NotificationBell({ alerts }: { alerts: UserAlert[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("alerts");
  const tTop = useTranslations("topBar");

  // Click-outside to close. Bound only when the popover is open so we
  // don't add a listener for every signed-in pageview.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (alerts.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        aria-label={tTop("notifications")}
        aria-expanded={open}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
          <path
            d="M5 8a5 5 0 0 1 10 0v3l1.5 2.5h-13L5 11V8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 16a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute right-1 top-1 size-2 rounded-full bg-violet-600 ring-2 ring-white dark:ring-gray-950"
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {t("heading", { count: alerts.length })}
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((alert) => (
              <li key={alert.kind}>
                <Link
                  href={alert.href}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t(`${alert.kind}.title`)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {t(`${alert.kind}.body`)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    {t(`${alert.kind}.action`)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
