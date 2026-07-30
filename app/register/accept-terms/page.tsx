import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptTermsForm } from "@/features/auth/components/accept-terms-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AcceptTermsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Un ultimo passo</CardTitle>
        </CardHeader>
        <CardContent>
          <AcceptTermsForm />
        </CardContent>
      </Card>
    </div>
  );
}
