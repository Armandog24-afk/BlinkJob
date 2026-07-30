import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { UserStatusActions } from "@/features/admin/components/user-status-actions";
import { AdjustPointsForm } from "@/features/admin/components/adjust-points-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/blinknow", label: "BlinkNow" },
  { href: "/admin/disputes", label: "Dispute" },
  { href: "/admin/documents", label: "Documenti" },
];

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  incomplete: "secondary",
  pending_verification: "secondary",
  suspended: "destructive",
  blocked: "destructive",
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: users }, { data: blinkpointsFlag }, { data: pointsRows }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, role, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", "blinkpoints_enabled")
      .maybeSingle(),
    supabase.from("points_ledger").select("user_id, points"),
  ]);

  const blinkpointsEnabled = blinkpointsFlag?.enabled_globally ?? false;
  const pointsByUser = new Map<string, number>();
  for (const row of pointsRows ?? []) {
    pointsByUser.set(row.user_id, (pointsByUser.get(row.user_id) ?? 0) + row.points);
  }

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Utenti ({users?.length ?? 0})</h1>
        <div className="space-y-3">
          {(users ?? []).map((u) => (
            <Card key={u.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{u.full_name}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">{u.role}</Badge>
                  <Badge variant={STATUS_VARIANT[u.status] ?? "secondary"}>{u.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{u.email}</p>
                <UserStatusActions userId={u.id} status={u.status} />
                {blinkpointsEnabled && u.role === "worker" && (
                  <div className="space-y-1 border-t pt-2">
                    <p>BlinkPoints: {pointsByUser.get(u.id) ?? 0}</p>
                    <AdjustPointsForm userId={u.id} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
