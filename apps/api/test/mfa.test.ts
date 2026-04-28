import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOtpauthUri, verifyTotp } from "../src/lib/mfa.js";

describe("mfa helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds an otpauth uri with issuer and account name", () => {
    const uri = buildOtpauthUri({
      secret: "ABCDEF1234567890",
      issuer: "ORGOS",
      accountName: "ceo@demo.orgos.ai"
    });

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("issuer=ORGOS");
    expect(uri).toContain("ORGOS%3Aceo%40demo.orgos.ai");
  });

  it("verifies a known TOTP vector", () => {
    vi.spyOn(Date, "now").mockReturnValue(59_000);

    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp(secret, "287082")).toBe(true);
    expect(verifyTotp(secret, "123456")).toBe(false);
  });
});
