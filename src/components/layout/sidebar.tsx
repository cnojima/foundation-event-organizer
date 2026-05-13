import { BrandMark } from "./brand-mark";
import { SidebarNav } from "./sidebar-nav";

type SidebarProps = {
  signedIn: boolean;
  guildRole: "admin" | "member" | null;
  isSuperAdmin: boolean;
  guildName: string | null;
};

export function Sidebar({
  signedIn,
  guildRole,
  isSuperAdmin,
  guildName,
}: SidebarProps) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-gray-200 dark:border-gray-800">
        <BrandMark size={36} />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wider text-gray-900 dark:text-gray-100">FOUNDATION GALACTIC FRONTIER</div>
          <div className="text-[10px] font-medium tracking-[0.2em] text-gray-500 dark:text-gray-400">EVENT ORGANIZER</div>
        </div>
      </div>

      <div className="px-3 py-4 flex-1">
        <SidebarNav
          signedIn={signedIn}
          guildRole={guildRole}
          isSuperAdmin={isSuperAdmin}
          hasGuild={!!guildName}
        />
      </div>

      {guildName && (
        <div className="m-4 rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-center dark:border-violet-900/60 dark:bg-violet-950/40">
          <div className="text-[10px] font-medium tracking-[0.2em] text-violet-600 dark:text-violet-300">GUILD</div>
          <div className="text-sm font-bold tracking-wider text-violet-900 mt-1 dark:text-violet-100">
            {guildName.toUpperCase()}
          </div>
          <div className="my-3 flex justify-center">
            <BrandMark size={48} />
          </div>
        </div>
      )}
    </aside>
  );
}
