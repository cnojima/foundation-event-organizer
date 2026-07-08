import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { NewSessionForm } from "@/components/damage-calculator/new-session-form";

export default async function NewDamageSessionPage() {
  const session = await auth();
  requireSuperAdminPage(session);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        New damage session
      </h1>
      <NewSessionForm />
    </div>
  );
}
