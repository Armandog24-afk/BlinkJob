// Mirrors the SQL source of truth (database/migrations/018, calculate_platform_fee_cents).
// Kept here purely as a documented, unit-tested reference of the v1 fee formula — the actual
// payment row is always computed and inserted server-side (SQL), never trusted from the client.

export const FEE_VERSION = "v1";
const PLATFORM_FEE_RATE = 0.12;

export function calculatePlatformFeeCents(grossAmountCents: number): number {
  return Math.floor(grossAmountCents * PLATFORM_FEE_RATE);
}

export function calculateNetAmountCents(grossAmountCents: number): number {
  return grossAmountCents - calculatePlatformFeeCents(grossAmountCents);
}
