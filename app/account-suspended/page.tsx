import { LogoutButton } from "@/features/auth/components/logout-button";

export default function AccountSuspendedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold">Account sospeso</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Il tuo account è stato sospeso o bloccato. Contatta il supporto BlinkJob per maggiori
        informazioni.
      </p>
      <LogoutButton />
    </div>
  );
}
