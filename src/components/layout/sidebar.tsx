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
    <aside className="relative hidden w-64 shrink-0 border-r border-white/10 lg:flex">
      {/* Space-scene background art — always dark, so sidebar content below
          is styled light-on-dark regardless of the site's light/dark mode. */}
      <div
        className="absolute inset-0 bg-cover bg-top bg-no-repeat"
        style={{ backgroundImage: "url('/bg-store-m.jpg')" }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#050e1c]/80 to-[#050e1c]/95"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
          <BrandMark size={36} />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wider text-white">RALLY UP</div>
            <div className="text-[10px] font-medium tracking-[0.2em] text-gray-300">FOUNDATION GALACTIC FRONTIER</div>
          </div>
        </div>

        <div className="px-3 py-4 flex-1">
          <SidebarNav
            signedIn={signedIn}
            guildRole={guildRole}
            isSuperAdmin={isSuperAdmin}
            hasGuild={!!guildName}
            variant="onImage"
          />
        </div>

        {guildName && (
          <div className="m-4 rounded-lg border border-violet-400/30 bg-violet-950/50 p-4 text-center backdrop-blur-sm">
            <div className="text-[10px] font-medium tracking-[0.2em] text-violet-300">GUILD</div>
            <div className="text-sm font-bold tracking-wider text-violet-100 mt-1">
              {guildName.toUpperCase()}
            </div>
            <div className="my-3 flex justify-center">
              <BrandMark size={48} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
