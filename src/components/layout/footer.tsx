import { getTranslations } from "next-intl/server";
import { BrandMark } from "./brand-mark";
import { FeedbackMenu } from "@/components/feedback-menu";
import type { FeedbackUserContext } from "@/lib/feedback";

export async function Footer({ user }: { user: FeedbackUserContext }) {
  const t = await getTranslations("footer");
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-5">
      <div className="flex items-center gap-3">
        <BrandMark size={20} />
        <span className="text-xs font-semibold tracking-[0.25em] text-gray-500">
          {t("tagline")}
        </span>
      </div>
      <FeedbackMenu user={user} />
    </footer>
  );
}
