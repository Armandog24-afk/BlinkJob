import { MailCheck } from "lucide-react";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="space-y-4 text-center">
      <MailCheck className="mx-auto size-10 text-primary" />
      <h1 className="text-lg font-semibold">Controlla la tua email</h1>
      <p className="text-sm text-muted-foreground">
        Ti abbiamo inviato un link di conferma
        {email ? (
          <>
            {" "}
            a <span className="font-medium text-foreground">{email}</span>
          </>
        ) : null}
        . Aprilo per attivare il tuo account.
      </p>
    </div>
  );
}
