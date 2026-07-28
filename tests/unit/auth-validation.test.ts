import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema } from "@/lib/validation/auth";
import { companyOnboardingSchema } from "@/lib/validation/company";

describe("registerSchema", () => {
  const valid = {
    accountKind: "worker" as const,
    fullName: "Maria Rossi",
    email: "maria@example.com",
    password: "supersegreta1",
    acceptedTerms: true as const,
  };

  it("accepts a valid worker registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid company registration", () => {
    expect(registerSchema.safeParse({ ...valid, accountKind: "company" }).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects when terms are not accepted", () => {
    const result = registerSchema.safeParse({ ...valid, acceptedTerms: false });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown account kind", () => {
    const result = registerSchema.safeParse({ ...valid, accountKind: "admin" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials shape", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("companyOnboardingSchema", () => {
  it("accepts a legal name without a VAT number", () => {
    const result = companyOnboardingSchema.safeParse({ legalName: "Acme Srl", vatNumber: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vatNumber).toBeUndefined();
    }
  });

  it("rejects a legal name that is too short", () => {
    expect(companyOnboardingSchema.safeParse({ legalName: "A" }).success).toBe(false);
  });
});
