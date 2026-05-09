"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Visibility =
  | "always"
  | "signedInWithGuild"
  | "guildAdmin"
  | "superAdmin"
  | "guildless";

type NavItem = {
  label: string;
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
};

const NAV_ITEMS: NavItem[] = [
  { label: "Manage Events", href: "/admin", icon: ICONS.dashboard, visibility: "guildAdmin" },
  { label: "Events", href: "/", icon: ICONS.events, visibility: "signedInWithGuild" },
  { label: "Players", href: "/admin/players", icon: ICONS.players, visibility: "guildAdmin" },
  { label: "Members", href: "/admin/members", icon: ICONS.members, visibility: "guildAdmin" },
  { label: "Invites", href: "/admin/invites", icon: ICONS.invites, visibility: "guildAdmin" },
  { label: "Settings", href: "/admin/settings", icon: ICONS.settings, visibility: "guildAdmin" },
  { label: "Super Admin", href: "/super-admin", icon: ICONS.shield, visibility: "superAdmin" },
  { label: "Browse Guilds", href: "/guilds", icon: ICONS.events, visibility: "guildless" },
  { label: "Create Guild", href: "/guilds/new", icon: ICONS.dashboard, visibility: "guildless" },
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
    case "signedInWithGuild":
      return p.signedIn && p.hasGuild;
    case "guildAdmin":
      return p.signedIn && (p.guildRole === "admin" || p.isSuperAdmin);
    case "superAdmin":
      return p.signedIn && p.isSuperAdmin;
    case "guildless":
      return p.signedIn && !p.hasGuild;
  }
}

export function SidebarNav(props: SidebarNavProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => isVisible(item, props));

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
              active
                ? "bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <span className={active ? "text-violet-600" : "text-gray-400"}>{item.icon}</span>
            <span className="uppercase">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
