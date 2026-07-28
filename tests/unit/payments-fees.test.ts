import { describe, expect, it } from "vitest";
import { calculatePlatformFeeCents, calculateNetAmountCents } from "@/lib/payments/fees";

describe("calculatePlatformFeeCents", () => {
  it("takes a flat 12% fee, rounded down", () => {
    expect(calculatePlatformFeeCents(9000)).toBe(1080);
    expect(calculatePlatformFeeCents(7000)).toBe(840);
  });

  it("rounds down rather than up on fractional cents", () => {
    // 12% of 101 = 12.12 -> floors to 12
    expect(calculatePlatformFeeCents(101)).toBe(12);
  });

  it("returns 0 fee for 0 gross", () => {
    expect(calculatePlatformFeeCents(0)).toBe(0);
  });
});

describe("calculateNetAmountCents", () => {
  it("nets gross minus fee exactly (never floating point, always integer cents)", () => {
    const gross = 9000;
    const net = calculateNetAmountCents(gross);
    expect(net).toBe(gross - calculatePlatformFeeCents(gross));
    expect(Number.isInteger(net)).toBe(true);
  });
});
