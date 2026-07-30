import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("document_templates")
    .select("title, body, version, created_at")
    .eq("scope", "platform")
    .eq("key", key)
    .order("version", { ascending: false })
    .limit(1);

  const doc = versions?.[0];
  if (!doc) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Blink<span className="text-primary">Job</span>
          </Link>
          <Button variant="ghost" render={<Link href="/">Torna alla home</Link>} />
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{doc.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Versione {doc.version} — in vigore dal {new Date(doc.created_at).toLocaleDateString("it-IT")}
            </p>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {doc.body}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
