"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type Visibility =
  | "always"
  | "signedIn"
  | "signedInWithGuild"
  | "memberOnly"
  | "guildAdmin"
  | "superAdmin"
  | "guildless";

type NavItem = {
  /** Translation key under `nav.*`. */
  labelKey: string;
  href: string;
  icon: React.ReactNode;
  visibility: Visibility;
};

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <rect x="2.5" y="4" width="15" height="13.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 2v4M14 2v4M2.5 8.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  players: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <circle cx="7.5" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 17c.5-3 2.5-5 5.5-5s5 2 5.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 12.5c2.5.3 4.5 2 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  members: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17c.7-3.4 3-5.5 6.5-5.5s5.8 2.1 6.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  invites: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <rect x="2.5" y="5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 6l7 5 7-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <path d="M10 2 L17 5v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4V12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
    </svg>
  ),
  swords: (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <path
        d="M3 3l5 5M3 3v3M3 3h3M17 3l-5 5M17 3v3M17 3h-3M8 8l4 4-5 5H3v-4l5-5ZM12 8l-4 4 5 5h4v-4l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: "manageEvents", href: "/admin", icon: ICONS.dashboard, visibility: "guildAdmin" },
  { labelKey: "events", href: "/", icon: ICONS.events, visibility: "signedInWithGuild" },
  { labelKey: "scrimHistory", href: "/scrims", icon: ICONS.swords, visibility: "signedInWithGuild" },
  { labelKey: "members", href: "/members", icon: ICONS.members, visibility: "memberOnly" },
  { labelKey: "players", href: "/admin/players", icon: ICONS.players, visibility: "guildAdmin" },
  { labelKey: "members", href: "/admin/members", icon: ICONS.members, visibility: "guildAdmin" },
  { labelKey: "scrimmages", href: "/admin/scrimmages", icon: ICONS.swords, visibility: "guildAdmin" },
  { labelKey: "invites", href: "/admin/invites", icon: ICONS.invites, visibility: "guildAdmin" },
  { labelKey: "settings", href: "/admin/settings", icon: ICONS.settings, visibility: "guildAdmin" },
  { labelKey: "superAdmin", href: "/super-admin", icon: ICONS.shield, visibility: "superAdmin" },
  { labelKey: "browseGuilds", href: "/guilds", icon: ICONS.events, visibility: "guildless" },
  { labelKey: "createGuild", href: "/guilds/new", icon: ICONS.dashboard, visibility: "guildless" },
  { labelKey: "adminHelp", href: "/admin/help", icon: ICONS.help, visibility: "guildAdmin" },
  { labelKey: "help", href: "/help", icon: ICONS.help, visibility: "always" },
  { labelKey: "myAccount", href: "/me", icon: ICONS.settings, visibility: "signedIn" },
];

type SidebarNavProps = {
  signedIn: boolean;
  guildRole: "admin" | "member" | null;
  isSuperAdmin: boolean;
  hasGuild: boolean;
};

function isVisible(item: NavItem, p: SidebarNavProps): boolean {
  switch (item.visibility) {
    case "always":
      return true;
    case "signedIn":
      return p.signedIn;
    case "signedInWithGuild":
      return p.signedIn && p.hasGuild;
    case "memberOnly":
      // Plain guild members (and super-admins from another guild). Admins of
      // the current guild see the richer /admin/members view instead.
      return (
        p.signedIn &&
        p.hasGuild &&
        p.guildRole !== "admin" &&
        !p.isSuperAdmin
      );
    case "guildAdmin":
      return p.signedIn && (p.guildRole === "admin" || p.isSuperAdmin);
    case "superAdmin":
      return p.signedIn && p.isSuperAdmin;
    case "guildless":
      return p.signedIn && !p.hasGuild;
  }
}

// Admin routes that participate in the super-admin "Acting as guild X" mode.
// When the URL has `?guildId=...`, these links should preserve it so the
// super-admin's navigation stays inside the impersonated guild instead of
// snapping back to their own. /admin/help is static and intentionally excluded.
const IMPERSONATION_AWARE_PREFIXES = [
  "/admin",
  "/admin/event",
  "/admin/players",
  "/admin/members",
  "/admin/invites",
  "/admin/scrimmages",
  "/admin/settings",
];

function preservesImpersonation(href: string): boolean {
  if (href === "/admin/help") return false;
  return IMPERSONATION_AWARE_PREFIXES.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`)
  );
}

export function SidebarNav(props: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const impersonatingGuildId = searchParams.get("guildId");
  const t = useTranslations("nav");
  const items = NAV_ITEMS.filter((item) => isVisible(item, props));

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const href =
          impersonatingGuildId && preservesImpersonation(item.href)
            ? `${item.href}?guildId=${impersonatingGuildId}`
            : item.href;
        return (
          <Link
            key={item.href}
            href={href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
              active
                ? "bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <span className={active ? "text-violet-600" : "text-gray-400"}>{item.icon}</span>
            <span className="uppercase">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
