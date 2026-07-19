import { describe, expect, it } from "vitest";
import type { ExplorerFile, ExplorerTreeNode } from "@/lib/repo/library";
import { flattenFolders, formatSize, sortFiles } from "./explorer-utils";

function file(partial: Partial<ExplorerFile>): ExplorerFile {
  return {
    id: 1,
    original_name: "a.txt",
    mime_type: "text/plain",
    size: 0,
    day: "2026-07-01",
    folder_path: "",
    created_at: "2026-07-01T08:00:00Z",
    subject_code: null,
    chapter_id: null,
    knowledge_point_ids: "",
    knowledge_titles: "",
    category: "knowledge",
    note: "",
    ...partial,
  };
}

describe("sortFiles", () => {
  const files = [
    file({ id: 1, original_name: "笔记.md", size: 300, day: "2026-07-02", created_at: "2026-07-02T09:00:00Z" }),
    file({ id: 2, original_name: "answers.pdf", size: 100, day: "2026-07-01", created_at: "2026-07-01T08:00:00Z" }),
    file({ id: 3, original_name: "báo cáo.txt", size: 200, day: "2026-07-02", created_at: "2026-07-02T07:00:00Z" }),
  ];

  it("按 zh-CN 排序规则升序（汉字按 ICU 中文表序，先于拉丁名）", () => {
    expect(sortFiles(files, "name", true).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(sortFiles(files, "name", false).map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it("按大小降序", () => {
    expect(sortFiles(files, "size", false).map((item) => item.id)).toEqual([1, 3, 2]);
  });

  it("同日期按入库时间排", () => {
    expect(sortFiles(files, "day", true).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("不改动入参数组", () => {
    const before = files.map((item) => item.id);
    sortFiles(files, "size", true);
    expect(files.map((item) => item.id)).toEqual(before);
  });
});

describe("flattenFolders", () => {
  const tree: ExplorerTreeNode[] = [
    {
      path: "数学", name: "数学", fileCount: 2,
      children: [
        { path: "数学/微积分", name: "微积分", fileCount: 1, children: [] },
      ],
    },
    { path: "英语", name: "英语", fileCount: 0, children: [] },
  ] as ExplorerTreeNode[];

  it("先序拍平并带层级深度", () => {
    expect(flattenFolders(tree)).toEqual([
      { path: "数学", name: "数学", depth: 0 },
      { path: "数学/微积分", name: "微积分", depth: 1 },
      { path: "英语", name: "英语", depth: 0 },
    ]);
  });
});

describe("formatSize", () => {
  it("按数量级换算", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });
});
