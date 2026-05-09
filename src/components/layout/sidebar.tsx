import { BrandMark } from "./brand-mark";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-gray-200">
        <BrandMark size={36} />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wider text-gray-900">FOUNDATION GALACTIC FRONTIER</div>
          <div className="text-[10px] font-medium tracking-[0.2em] text-gray-500">EVENT ORGANIZER</div>
        </div>
      </div>

      <div className="px-3 py-4 flex-1">
        <SidebarNav isAdmin={isAdmin} />
      </div>

      <div className="m-4 rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-center">
        <div className="text-xs font-bold tracking-wider text-violet-900">SHADOWFRONT</div>
        <div className="text-[10px] font-medium tracking-[0.2em] text-violet-600">GLOBAL ASSAULT</div>
        <div className="my-3 flex justify-center">
          <BrandMark size={48} />
        </div>
        <div className="text-[11px] font-semibold text-gray-800">NOV 15 — DEC 6, 2025</div>
        <div className="text-[10px] tracking-wider text-gray-500 mt-0.5">UTC EVENT WINDOW</div>
      </div>
    </aside>
  );
}
