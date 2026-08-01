import { describe, expect, it } from "vitest";
import {
  getAlgorithmProviderDescriptor,
  identifyAlgorithmProvider,
} from "./algorithm-providers";

describe("algorithm provider capability registry", () => {
  it("recognizes supported external-link providers without claiming an API", () => {
    const bailian = identifyAlgorithmProvider("https://bailian.openjudge.cn/practice/1000/");
    expect(bailian).toMatchObject({
      id: "bailian",
      mode: "external_record",
      authentication: "none",
      cachePolicy: "link_metadata_only",
      evidenceSource: "user_reported",
      capabilities: {
        externalLink: true,
        search: false,
        accountConnection: false,
        historyImport: false,
        remoteSubmit: false,
        verifiedEvidence: false,
      },
    });
  });

  it("keeps unknown HTTPS sources in generic record-only mode", () => {
    expect(identifyAlgorithmProvider("https://example.edu/problem/42").id).toBe("external");
    expect(getAlgorithmProviderDescriptor("missing").label).toBe("外部题目");
  });
});
