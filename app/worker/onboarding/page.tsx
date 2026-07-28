import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { WorkerOnboardingForm } from "@/features/workers/components/onboarding-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WorkerOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: existingProfile } = await supabase
    .from("worker_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfile) redirect("/worker/dashboard");

  const { data: skills } = await supabase
    .from("skill_taxonomy")
    .select("id,name,category")
    .eq("status", "active")
    .order("category")
    .order("name");

  return (
    <div className="flex min-h-screen justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Completa il tuo profilo, {user.full_name.split(" ")[0]}</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkerOnboardingForm skills={skills ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
