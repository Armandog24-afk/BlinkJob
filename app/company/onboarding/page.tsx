import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CompanyOnboardingForm } from "@/features/companies/components/company-onboarding-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CompanyOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) redirect("/company/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Crea la tua azienda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Dati minimi per iniziare a pubblicare incarichi. Potrai aggiungere sedi e invitare
            colleghi dopo.
          </p>
          <CompanyOnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
