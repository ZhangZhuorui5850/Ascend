import { describe, expect, it } from "vitest";
import {
  getAlgorithmProviderDescriptor,
  identifyAlgorithmProvider,
  suggestCourseForSource,
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

describe("suggestCourseForSource", () => {
  it("routes 程设实习 MOOC textbook pages to 例题", () => {
    expect(suggestCourseForSource("http://cxsjsxmooc.openjudge.cn/book/050/")).toEqual({
      courseName: "程序设计实习",
      stageKey: "例题",
    });
  });

  it("routes term homework groups to 课后习题 regardless of term name", () => {
    for (const url of [
      "http://cxsjsxmooc.openjudge.cn/2023t2spring/001/",
      "https://cxsjsxmooc.openjudge.cn/2019fall/hw/007",
      "http://cxsjsxmooc.openjudge.cn/",
    ]) {
      expect(suggestCourseForSource(url)).toMatchObject({
        courseName: "程序设计实习",
        stageKey: "课后习题",
      });
    }
  });

  it("ignores hosts outside the MOOC course station", () => {
    expect(suggestCourseForSource("http://bailian.openjudge.cn/practice/1001")).toBeNull();
    expect(suggestCourseForSource("http://poj.org/problem?id=3190")).toBeNull();
    expect(suggestCourseForSource("not a url at all")).toBeNull();
    expect(suggestCourseForSource("")).toBeNull();
  });

  it("matches subdomains of the course station", () => {
    expect(suggestCourseForSource("http://hw.cxsjsxmooc.openjudge.cn/2023t2spring/002/"))
      .toMatchObject({ stageKey: "课后习题" });
  });
});
