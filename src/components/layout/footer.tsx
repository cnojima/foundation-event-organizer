import { BrandMark } from "./brand-mark";

export function Footer() {
  return (
    <footer className="flex items-center justify-center gap-3 border-t border-gray-200 bg-white px-6 py-5">
      <BrandMark size={20} />
      <span className="text-xs font-semibold tracking-[0.25em] text-gray-500">
        THE FOUNDATION CALLS. ANSWER TOGETHER.
      </span>
    </footer>
  );
}
