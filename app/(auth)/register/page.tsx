import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/register-form";
import type { AccountKind } from "@/lib/validation/auth";
import { REGISTRATION_ENABLED } from "@/lib/config";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const defaultKind: AccountKind = params.as === "company" ? "company" : "worker";

  if (!REGISTRATION_ENABLED) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-lg font-semibold">Registrazione temporaneamente sospesa</h1>
        <p className="text-sm text-muted-foreground">
          Stiamo sistemando un problema. Torna a trovarci a breve, oppure{" "}
          <Link href="/login" className="text-primary underline underline-offset-4">
            accedi
          </Link>{" "}
          con un account già esistente.
        </p>
      </div>
    );
  }

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
