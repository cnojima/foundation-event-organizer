import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { CreateGuildForm } from "@/components/create-guild-form";

export default async function NewGuildPage() {
  const session = await auth();
  const membership = requireSignedInPage(session);
  if (membership.guildId) redirect("/");

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
        Create a Guild
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        You&apos;ll be the first admin. You can invite others once it&apos;s created.
      </p>
      <CreateGuildForm />
    </div>
  );
}
