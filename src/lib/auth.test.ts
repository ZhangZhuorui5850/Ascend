import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

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
