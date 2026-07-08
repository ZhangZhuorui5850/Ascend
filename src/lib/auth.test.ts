import { describe, expect, it } from "vitest";
import { getDefaultLoginConfig, hashPassword, verifyPassword } from "./auth";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong password", () => {
    const stored = hashPassword("correct-horse-battery-staple", "fixed-test-salt");

    expect(verifyPassword("correct-horse-battery-staple", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("stores algorithm and salt with the hash", () => {
    const stored = hashPassword("secret", "fixed-test-salt");

    expect(stored).toMatch(/^scrypt\$fixed-test-salt\$/);
  });
});

describe("default login config", () => {
  it("falls back to legacy basic auth environment variables", () => {
    expect(getDefaultLoginConfig({
      APP_BASIC_AUTH_USERNAME: "legacy@example.com",
      APP_BASIC_AUTH_PASSWORD: "legacy-password",
    })).toEqual({
      email: "legacy@example.com",
      password: "legacy-password",
    });
  });
});
