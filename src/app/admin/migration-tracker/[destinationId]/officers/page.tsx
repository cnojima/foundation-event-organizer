import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationOfficers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { MigrationOfficersManager } from "@/components/migration-officers-manager";

export const metadata = { title: "Migration Tracker — Officers" };

export default async function MigrationDestinationOfficersPage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  const session = await auth();
  const { destination, isServerAdmin } = await requireMigrationDestinationReviewPage(
    session,
    destinationId
  );
  if (!isServerAdmin) redirect(`/admin/migration-tracker/${destinationId}`);

  const officers = await db
    .select({
      userId: migrationOfficers.userId,
      createdAt: migrationOfficers.createdAt,
      name: users.name,
      username: users.username,
      inGameName: users.inGameName,
    })
    .from(migrationOfficers)
    .innerJoin(users, eq(users.id, migrationOfficers.userId))
    .where(eq(migrationOfficers.destinationId, destination.id));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader kicker="Admin" title={`Server #${destination.serverNumber} — Officers`} />
      <MigrationOfficersManager
        destinationId={destination.id}
        initialOfficers={officers.map((o) => ({
          userId: o.userId,
          displayName: o.inGameName ?? o.name ?? o.username ?? o.userId,
        }))}
      />
    </div>
  );
}
