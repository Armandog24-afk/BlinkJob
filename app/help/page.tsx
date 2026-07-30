import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    title: "Come funziona il matching",
    body: [
      "Quando un'azienda pubblica un incarico, BlinkJob calcola in automatico un punteggio di compatibilità per ogni lavoratore disponibile, basato su distanza dalla sede, disponibilità oraria, competenze richieste (obbligatorie e preferenziali) e affidabilità (rating dalle recensioni passate).",
      "Ogni punteggio è spiegato con i motivi concreti (es. \"distanza 2.3 km\", \"disponibile negli orari richiesti\") — non è un algoritmo a scatola chiusa.",
    ],
  },
  {
    title: "Candidarsi o essere invitati",
    body: [
      "I lavoratori possono candidarsi direttamente agli incarichi pubblicati, oppure ricevere un invito diretto da un'azienda tra i candidati compatibili.",
      "L'azienda può confermare o rifiutare una candidatura; il lavoratore può accettare o rifiutare un invito. Una volta confermata, la candidatura diventa un incarico assegnato con i termini (compenso, orari, sede) fissati in quel momento.",
    ],
  },
  {
    title: "Check-in e check-out",
    body: [
      "L'inizio e la fine di un incarico si registrano con un check-in/check-out manuale dall'app, oppure inquadrando il QR code che l'azienda mostra sul luogo di lavoro (nessuna app dedicata: basta la fotocamera).",
      "Il completamento dell'incarico va confermato da almeno una delle due parti dopo il check-out.",
    ],
  },
  {
    title: "Pagamenti",
    body: [
      "Al completamento di un incarico viene generato un pagamento tracciato (importo lordo, commissione piattaforma, netto al lavoratore). Lo stato del pagamento è visibile in tempo reale nella sezione Pagamenti di entrambi i ruoli.",
    ],
  },
  {
    title: "Recensioni",
    body: [
      "Dopo un incarico completato, azienda e lavoratore possono lasciarsi una recensione reciproca. Le recensioni costruiscono il punteggio di affidabilità usato anche nel matching.",
    ],
  },
  {
    title: "Chat e privacy dei contatti",
    body: [
      "Ogni candidatura o incarico ha una chat dedicata tra azienda e lavoratore coinvolti — accessibile con il pulsante \"Chat\" dalle rispettive pagine.",
      "Per sicurezza, email e numeri di telefono scritti nei messaggi vengono rimossi automaticamente prima del salvataggio. Un messaggio inappropriato può essere segnalato con il pulsante \"Segnala\" accanto ad esso.",
    ],
  },
  {
    title: "Dispute e appello",
    body: [
      "Se qualcosa non va durante o dopo un incarico, ciascuna parte può segnalare un problema (\"Segnala un problema\" nella pagina Assegnazioni), aprendo una disputa che il team di supporto esamina e risolve.",
      "Se non sei d'accordo con la risoluzione, puoi fare appello una volta sola dalla pagina Dispute: il team riesamina il caso e prende una decisione finale.",
    ],
  },
  {
    title: "BlinkNow (incarichi urgenti)",
    body: [
      "Per le categorie abilitate, un'azienda verificata può marcare un incarico come urgente (BlinkNow): il sistema notifica i lavoratori compatibili in ondate successive per priorità, con una finestra di risposta limitata e una fee dedicata tracciata a ledger.",
    ],
  },
  {
    title: "BlinkPoints e livelli",
    body: [
      "I lavoratori accumulano punti completando incarichi (con bonus per affidabilità e disponibilità su incarichi urgenti), salgono di livello e sbloccano badge visibili alle aziende nella lista candidati.",
    ],
  },
  {
    title: "Template e talent pool (aziende)",
    body: [
      "Un'azienda può salvare un incarico pubblicato come template riutilizzabile (luogo e orari restano sempre da compilare) e aggiungere al proprio talent pool i lavoratori con cui ha già completato almeno un incarico, per ritrovarli più facilmente in futuro.",
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Blink<span className="text-primary">Job</span>
          </Link>
          <Button variant="ghost" render={<Link href="/">Torna alla home</Link>} />
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Centro assistenza</h1>
        <p className="mt-2 text-muted-foreground">
          Come funziona BlinkJob, passo per passo.
        </p>

        <div className="mt-8 space-y-4">
          {SECTIONS.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Serve altro aiuto?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Per problemi con un incarico specifico, usa la chat dedicata o apri una segnalazione
            dalla pagina Assegnazioni: arriva direttamente al team di supporto.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
