import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { getSessionDetail } from "@/lib/damage-calculator/get-session-detail";
import { SessionDetailView } from "@/components/damage-calculator/session-detail-view";

export default async function DamageSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  requireSuperAdminPage(session);

  const detail = await getSessionDetail(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <SessionDetailView detail={detail} />
    </div>
  );
}
