import { RegisterForm } from "@/features/auth/components/register-form";
import type { AccountKind } from "@/lib/validation/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const defaultKind: AccountKind = params.as === "company" ? "company" : "worker";

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Crea il tuo account</h1>
        <p className="text-sm text-muted-foreground">
          Gratis, meno di un minuto per iniziare.
        </p>
      </div>
      <RegisterForm defaultKind={defaultKind} />
    </div>
  );
}
