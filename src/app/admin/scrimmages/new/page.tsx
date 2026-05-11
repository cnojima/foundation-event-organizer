import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { ProposeScrimForm } from "@/components/propose-scrim-form";

export default async function NewScrimPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">Guild not found.</p>
      </main>
    );
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });

  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const guildSuffix = isImpersonating ? `?guildId=${targetGuildId}` : "";

  // Only same-server live guilds (excluding self) are valid opponents. If
  // `actingGuild` has no serverNumber, the list is empty — the form surfaces
  // a helpful message asking them to set Server # first.
  const opponents = actingGuild?.serverNumber
    ? await db
        .select({ id: guilds.id, name: guilds.name, tag: guilds.tag })
        .from(guilds)
        .where(
          and(
            eq(guilds.serverNumber, actingGuild.serverNumber),
            ne(guilds.id, actingGuild.id),
            isNull(guilds.deletedAt)
          )
        )
    : [];

  return (
    <main className="max-w-3xl mx-auto p-6">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <Link
        href={`/admin/scrimmages${guildSuffix}`}
        className="text-sm text-violet-700 hover:underline"
      >
        ← Back to scrimmages
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold tracking-tight text-gray-900">
        Propose a scrim
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Send a guild-vs-guild challenge. The other guild&apos;s admin will see
        it in their scrimmages dashboard and can accept or decline.
        {actingGuild?.serverNumber ? (
          <>
            {" "}Your server: <strong>#{actingGuild.serverNumber}</strong>.
          </>
        ) : (
          <span className="text-amber-700">
            {" "}Set your Server # in{" "}
            <Link
              href={`/admin/settings${guildSuffix}`}
              className="underline"
            >
              Guild Settings
            </Link>{" "}
            first.
          </span>
        )}
      </p>

      <ProposeScrimForm opponents={opponents} />
    </main>
  );
}
