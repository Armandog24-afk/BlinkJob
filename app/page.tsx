import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, CalendarCheck, ShieldCheck, Star } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-xl font-semibold tracking-tight">
            Blink<span className="text-primary">Job</span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/login">Accedi</Link>} />
            <Button render={<Link href="/register">Registrati</Link>} />
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-4xl flex-1 flex-col items-center px-4 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Il lavoro temporaneo, coperto in ore, non giorni
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          BlinkJob collega aziende con esigenze operative temporanee a lavoratori disponibili
          nella stessa area, con matching spiegabile e tracciabilità end-to-end.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            render={<Link href="/register?as=company">Pubblica un incarico</Link>}
          />
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/register?as=worker">Trova incarichi vicino a te</Link>}
          />
        </div>

        <div className="mt-16 grid gap-6 text-left sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <MapPin className="size-5 text-primary" />
              <CardTitle className="text-base">Matching geolocalizzato</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Trova lavoratori compatibili per distanza, disponibilità e competenze, con la
              spiegazione di ogni suggerimento.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <CalendarCheck className="size-5 text-primary" />
              <CardTitle className="text-base">Pubblica in 5 minuti</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Un wizard guidato per ruolo, luogo, orari e compenso: dal bisogno alla copertura,
              senza ore di telefonate.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="text-base">Tracciabilità end-to-end</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Check-in/out, conferme e pagamento tracciato per ogni incarico, dalla candidatura
              alla recensione.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Star className="size-5 text-primary" />
              <CardTitle className="text-base">Reputazione bilaterale</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Recensioni e metriche oggettive costruiscono fiducia sia per aziende sia per
              lavoratori.
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BlinkJob — MVP in sviluppo.
      </footer>
    </div>
  );
}
