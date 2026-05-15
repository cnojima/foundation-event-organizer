import type { ReactNode } from "react";

// Shared page-header for in-app surfaces. Applies after the rebrand so
// every signed-in page reads as part of the same product:
//
//   <PageHeader
//     kicker="Find opponents"
//     title="Players"
//     subtitle="6 players on your server"
//     rightSlot={<ServerBadge />}
//   >
//     {/* optional extra content below subtitle (filters, help links) */}
//   </PageHeader>
//
// Visual moves carrying brand identity into the chrome:
//   - Small uppercase tracked kicker in violet
//   - Title gets a short violet underline accent (the same gradient used
//     by the landing hero) so brand identity shows up without
//     dominating the page
//   - rightSlot lives on the same baseline as the title for compact pages,
//     wraps below on narrow viewports
//
// All slots are optional except title; pages that don't need a kicker or
// subtitle can omit them. The accent bar always renders — that's the
// throughline tying every page together.
export function PageHeader({
  kicker,
  title,
  subtitle,
  rightSlot,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-violet-700 dark:text-violet-300">
              {kicker}
            </p>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-gray-100">
            {title}
          </h1>
          <div
            aria-hidden="true"
            className="mt-2 h-[2px] w-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-400"
          />
          {subtitle && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
          {children}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </header>
  );
}
