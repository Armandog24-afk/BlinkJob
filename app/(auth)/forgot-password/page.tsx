import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Password dimenticata?</h1>
        <p className="text-sm text-muted-foreground">
          Inserisci la tua email: ti mandiamo un link per reimpostarla.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
