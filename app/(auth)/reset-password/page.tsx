import { ResetPasswordGate } from "@/features/auth/components/reset-password-gate";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Imposta una nuova password</h1>
      </div>
      <ResetPasswordGate />
    </div>
  );
}
