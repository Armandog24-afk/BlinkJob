// Mirrors the SQL source of truth (database/migrations/025, calculate_blinknow_fee_cents).
// v1: fee flat, no city/category variation (PRD sez. 9.1 leaves real pricing to a founder
// decision not yet made) — kept here purely so the UI can show the fee before the RPC call.

export const BLINKNOW_FEE_CENTS = 1500;

/** Absolute distance bands from the job location, used for the concentric-wave notification. */
export const BLINKNOW_WAVE_BANDS_KM = [5, 15, 30] as const;

// Il numero d'ondata NON è un raggio fisso: un lavoratore con livello BlinkPoints alto viene
// promosso a un'ondata precedente rispetto alla sua sola distanza (025, "livello-adjusted") —
// mostrare "entro N km" per numero d'ondata sarebbe quindi impreciso una volta applicata la
// promozione. L'etichetta descrive solo la priorità relativa, non un raggio esatto.
export function formatWavePriorityLabel(waveNumber: number): string {
  if (waveNumber <= 1) return "priorità massima";
  if (waveNumber === 2) return "priorità alta";
  if (waveNumber === 3) return "priorità media";
  return "priorità standard";
}
