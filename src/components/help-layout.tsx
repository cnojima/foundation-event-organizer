"use client";

import { useEffect, useState } from "react";

export type HelpSectionMeta = { id: string; title: string };

// Two-pane help layout: article on the left, sticky table-of-contents on the
// right (desktop). On mobile the TOC folds into a collapsible "Contents"
// block above the article. Active-section highlighting uses an
// IntersectionObserver — the section whose top sits highest in the viewport
// (without being past the trigger line) wins.
export function HelpLayout({
  sections,
  children,
}: {
  sections: HelpSectionMeta[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null
  );

  useEffect(() => {
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Trigger when the section's top crosses the 25% line so the active
      // highlight feels anticipatory rather than lagging.
      { rootMargin: "0px 0px -75% 0px", threshold: 0 }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
      <article className="space-y-6 text-gray-800 dark:text-gray-200">
        <MobileToc sections={sections} />
        {children}
      </article>
      <aside className="hidden lg:block">
        <nav className="sticky top-4 rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-sm dark:border-gray-800 dark:bg-gray-900/80">
          <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
            On this page
          </p>
          <div className="space-y-0.5">
            {sections.map((s) => {
              const active = s.id === activeId;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`block rounded px-2 py-1 leading-snug transition-colors ${
                    active
                      ? "bg-violet-100 font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "text-gray-600 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  {s.title}
                </a>
              );
            })}
          </div>
        </nav>
      </aside>
    </div>
  );
}

function MobileToc({ sections }: { sections: HelpSectionMeta[] }) {
  if (sections.length === 0) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 lg:hidden dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer list-none px-4 py-2 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden dark:text-gray-300">
        Contents
      </summary>
      <ul className="space-y-1 border-t border-gray-200 px-4 py-2 text-sm dark:border-gray-800">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded px-2 py-1 text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

// One H2 section, rendered as a native <details> so it can collapse. Default
// open so first-time readers get the full narrative; collapse to focus.
// `scroll-mt-4` keeps anchor jumps from crashing into the top edge.
export function CollapsibleSection({
  id,
  title,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-4 border-b border-gray-100 pb-6 last:border-b-0 dark:border-gray-800"
    >
      <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 [&::-webkit-details-marker]:hidden dark:hover:bg-gray-800">
        <Chevron />
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          {title}
        </h2>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90 dark:text-gray-500"
    >
      <path
        d="M7 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
