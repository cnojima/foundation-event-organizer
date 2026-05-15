import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { eventTemplates } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { parseTemplateBody } from "../route";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// PATCH /api/admin/templates/[id] — full-replace update (POSTed shape).
// We don't support partial PATCH today: the admin form sends the whole
// template back, which keeps validation simple and matches how PATCH
// works elsewhere in this codebase (e.g. /api/admin/events/[id]).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const existing = await db.query.eventTemplates.findFirst({
    where: and(eq(eventTemplates.id, id), isNull(eventTemplates.deletedAt)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Regular admins can only touch their own guild's templates.
  if (!membership.isSuperAdmin && existing.guildId !== membership.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = parseTemplateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await db
    .update(eventTemplates)
    .set(parsed.value)
    .where(eq(eventTemplates.id, id));

  void logAudit({
    guildId: existing.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "event_template.update",
    entityType: "event_template",
    entityId: id,
    entityLabel: parsed.value.templateName,
    changes: {
      before: { templateName: existing.templateName },
      after: parsed.value,
    },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/templates/[id] — soft delete via deletedAt. We don't
// hard-delete because templates may be referenced (informally) in other
// places later. Re-creating a same-named template is fine; the soft-deleted
// row stays out of the picker.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const existing = await db.query.eventTemplates.findFirst({
    where: and(eq(eventTemplates.id, id), isNull(eventTemplates.deletedAt)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (!membership.isSuperAdmin && existing.guildId !== membership.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  await db
    .update(eventTemplates)
    .set({ deletedAt: nowIso })
    .where(eq(eventTemplates.id, id));

  void logAudit({
    guildId: existing.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "event_template.delete",
    entityType: "event_template",
    entityId: id,
    entityLabel: existing.templateName,
    changes: { before: { templateName: existing.templateName } },
  });

  return NextResponse.json({ success: true });
}
