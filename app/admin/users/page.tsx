import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { UserStatusActions } from "@/features/admin/components/user-status-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/disputes", label: "Dispute" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  incomplete: "secondary",
  pending_verification: "secondary",
  suspended: "destructive",
  blocked: "destructive",
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, email, full_name, role, status, created_at")
    .order("created_at", { ascending: false });

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
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
