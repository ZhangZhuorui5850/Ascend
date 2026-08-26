import { describe, expect, it } from "vitest";
import { getPublicRequestOrigin } from "./public-origin";

describe("public request origin", () => {
  it("uses the configured production domain instead of the container address", () => {
    const request = new Request("http://0.0.0.0:3000/api/algorithm/vscode/pairings");

    expect(getPublicRequestOrigin(request, { APP_DOMAIN: "ascend.zhuorui.me" })).toBe("https://ascend.zhuorui.me");
  });

  it("accepts an explicit configured origin", () => {
    const request = new Request("http://0.0.0.0:3000/api/algorithm/vscode/pairings");

    expect(getPublicRequestOrigin(request, { APP_DOMAIN: "http://localhost:4100/path" })).toBe("http://localhost:4100");
  });

  it("uses reverse-proxy headers when no domain is configured", () => {
    const request = new Request("http://0.0.0.0:3000/api/algorithm/vscode/pairings", {
      headers: {
        host: "0.0.0.0:3000",
        "x-forwarded-host": "preview.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicRequestOrigin(request, {})).toBe("https://preview.example.test");
  });

  it("preserves direct local request origins", () => {
    const request = new Request("http://127.0.0.1:3400/api/algorithm/vscode/pairings");

    expect(getPublicRequestOrigin(request, {})).toBe("http://127.0.0.1:3400");
  });
});
