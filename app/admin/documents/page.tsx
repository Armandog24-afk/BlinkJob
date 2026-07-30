import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { NewDocumentVersionForm } from "@/features/admin/components/new-document-version-form";
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

export default async function AdminDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("document_templates")
    .select("id, scope, key, title, version, created_at")
    .order("scope", { ascending: true })
    .order("key", { ascending: true })
    .order("version", { ascending: false });

  const templateIds = (templates ?? []).map((t) => t.id);
  const { data: acceptances } = templateIds.length
    ? await supabase.from("document_acceptances").select("document_template_id").in("document_template_id", templateIds)
    : { data: [] as { document_template_id: string }[] };

  const acceptanceCounts = new Map<string, number>();
  for (const a of acceptances ?? []) {
    acceptanceCounts.set(a.document_template_id, (acceptanceCounts.get(a.document_template_id) ?? 0) + 1);
  }

  const byKey = new Map<string, NonNullable<typeof templates>>();
  for (const t of templates ?? []) {
    const groupKey = `${t.scope}:${t.key}`;
    if (!byKey.has(groupKey)) byKey.set(groupKey, []);
    byKey.get(groupKey)!.push(t);
  }

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Archivio documenti</h1>
        <p className="text-sm text-muted-foreground">
          Versioni pubblicate per ciascun documento e numero di accettazioni tracciate (con
          timestamp/IP). Il testo è una bozza operativa — il contenuto legale definitivo va
          validato con un legale prima del lancio pubblico.
        </p>

        <div className="space-y-4">
          {Array.from(byKey.entries()).map(([groupKey, versions]) => {
            const latest = versions[0];
            return (
              <Card key={groupKey}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{latest.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {latest.scope === "platform" ? "Piattaforma" : "Incarico"} · {latest.key}
                    </p>
                  </div>
                  <Badge variant="outline">v{latest.version} corrente</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {versions.map((v) => (
                    <p key={v.id}>
                      v{v.version} — pubblicata il {new Date(v.created_at).toLocaleDateString("it-IT")} ·{" "}
                      {acceptanceCounts.get(v.id) ?? 0} accettazioni
                    </p>
                  ))}
                  <div className="pt-2">
                    <NewDocumentVersionForm scope={latest.scope} documentKey={latest.key} currentTitle={latest.title} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
