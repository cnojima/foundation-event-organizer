"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  buildIssueUrl,
  FEEDBACK_ISSUES_URL,
  type FeedbackUserContext,
} from "@/lib/feedback";

export function FeedbackMenu({ user }: { user: FeedbackUserContext }) {
  const tFooter = useTranslations("footer");
  const tFeedback = useTranslations("feedback");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openIssue(kind: "bug" | "suggestion") {
    const viewport =
      typeof window !== "undefined"
        ? `${window.innerWidth}×${window.innerHeight}`
        : "unknown";
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    const url = buildIssueUrl({
      kind,
      pagePath: pathname || "/",
      viewport,
      userAgent,
      user,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold tracking-wider text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        {tFooter("feedback")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <MenuItem
            title={tFeedback("reportBug")}
            description={tFeedback("reportBugDescription")}
            onClick={() => openIssue("bug")}
          />
          <MenuItem
            title={tFeedback("suggestFeature")}
            description={tFeedback("suggestFeatureDescription")}
            onClick={() => openIssue("suggestion")}
          />
          <a
            href={FEEDBACK_ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() => setOpen(false)}
          >
            <div className="font-semibold text-gray-900 dark:text-gray-100">{tFeedback("browseAll")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {tFeedback("browseAllDescription")}
            </div>
          </a>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
    </button>
  );
}
