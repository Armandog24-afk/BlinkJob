import { LoginForm } from "@/features/auth/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Accedi</h1>
        <p className="text-sm text-muted-foreground">Entra nel tuo account BlinkJob.</p>
      </div>
      {params.error === "confirmation_failed" && (
        <p className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
          Il link di conferma non è valido o è scaduto.
        </p>
      )}
      <LoginForm redirectTo={params.redirect} />
    </div>
  );
}
