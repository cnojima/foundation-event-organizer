"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FEEDBACK_ISSUES_URL } from "@/lib/feedback";

const STORAGE_KEY = "alphaBannerDismissed";

export function AlphaBanner() {
  const t = useTranslations("alphaBanner");
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    setHidden(false);
  }, []);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-bold uppercase tracking-wider">
        {t("tag")}
      </span>
      <span>
        {t.rich("message", {
          feedbackLink: (chunks) => <strong>{chunks}</strong>,
          githubLink: (chunks) => (
            <a
              href={FEEDBACK_ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline hover:text-amber-700"
            >
              {chunks}
            </a>
          ),
        })}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="ml-2 rounded p-1 text-amber-700 hover:bg-amber-100"
      >
        <svg viewBox="0 0 14 14" className="size-3" aria-hidden>
          <path
            d="M2 2l10 10M12 2L2 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
