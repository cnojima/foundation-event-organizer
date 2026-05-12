import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "./brand-mark";
import { FeedbackMenu } from "@/components/feedback-menu";
import { SUPPORT_DISCORD_URL, type FeedbackUserContext } from "@/lib/feedback";

export async function Footer({ user }: { user: FeedbackUserContext }) {
  const t = await getTranslations("footer");
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-5">
      <div className="flex items-center gap-3">
        <BrandMark size={20} />
        <span className="text-xs font-semibold tracking-[0.25em] text-gray-500">
          {t("tagline")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/tos"
          className="text-xs font-semibold text-gray-500 hover:text-gray-700 hover:underline"
        >
          {t("terms")}
        </Link>
        <Link
          href="/privacy"
          className="text-xs font-semibold text-gray-500 hover:text-gray-700 hover:underline"
        >
          {t("privacy")}
        </Link>
        <a
          href={SUPPORT_DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          {t("discordSupport")}
        </a>
        <FeedbackMenu user={user} />
      </div>
    </footer>
  );
}
