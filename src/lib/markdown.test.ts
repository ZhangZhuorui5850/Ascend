import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, splitTableRow, type BlockNode, type InlineNode } from "./markdown";

function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.text;
      if (node.kind === "link") return node.label;
      return inlineText(node.children);
    })
    .join("");
}

function table(blocks: BlockNode[]): Extract<BlockNode, { kind: "table" }> {
  const found = blocks.find((block) => block.kind === "table");
  if (!found || found.kind !== "table") throw new Error("expected a table block");
  return found;
}

describe("parseMarkdown 表格", () => {
  it("解析基础表格：表头、分隔行、数据行", () => {
    const blocks = parseMarkdown(["| 名称 | 数量 |", "| --- | --- |", "| 苹果 | 3 |", "| 梨 | 5 |"].join("\n"));
    const t = table(blocks);
    expect(t.header.map(inlineText)).toEqual(["名称", "数量"]);
    expect(t.rows.length).toBe(2);
    expect(t.rows[0].map(inlineText)).toEqual(["苹果", "3"]);
    expect(t.rows[1].map(inlineText)).toEqual(["梨", "5"]);
  });

  it("支持无外侧竖线的表格", () => {
    const blocks = parseMarkdown(["名称 | 数量", "--- | ---", "苹果 | 3"].join("\n"));
    const t = table(blocks);
    expect(t.header.map(inlineText)).toEqual(["名称", "数量"]);
    expect(t.rows[0].map(inlineText)).toEqual(["苹果", "3"]);
  });

  it("解析对齐方式", () => {
    const blocks = parseMarkdown(["| a | b | c | d |", "| :--- | :---: | ---: | --- |", "| 1 | 2 | 3 | 4 |"].join("\n"));
    expect(table(blocks).align).toEqual(["left", "center", "right", null]);
  });

  it("短行补空、长行截断，列数与表头一致", () => {
    const blocks = parseMarkdown(["| a | b | c |", "| - | - | - |", "| 1 |", "| 1 | 2 | 3 | 4 |"].join("\n"));
    const t = table(blocks);
    expect(t.rows[0].map(inlineText)).toEqual(["1", "", ""]);
    expect(t.rows[1].map(inlineText)).toEqual(["1", "2", "3"]);
  });

  it("行内代码里的竖线不拆列，\\| 转义为字面量（含代码内）", () => {
    const blocks = parseMarkdown(["| 代码 | 说明 |", "| --- | --- |", "| `a \\|\\| b` | 或\\|运算 |"].join("\n"));
    const t = table(blocks);
    expect(t.rows[0].length).toBe(2);
    expect(t.rows[0][0]).toEqual([{ kind: "code", text: "a || b" }]);
    expect(inlineText(t.rows[0][1])).toBe("或|运算");
  });

  it("表格紧跟段落时能中断段落", () => {
    const blocks = parseMarkdown(["前置说明", "| a | b |", "| - | - |", "| 1 | 2 |"].join("\n"));
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[1].kind).toBe("table");
  });

  it("表头与分隔行列数不一致时不识别为表格", () => {
    const blocks = parseMarkdown(["| a | b |", "| --- |", "| 1 | 2 |"].join("\n"));
    expect(blocks.every((block) => block.kind !== "table")).toBe(true);
  });

  it("单元格内容支持行内格式", () => {
    const blocks = parseMarkdown(["| a |", "| - |", "| **加粗** 与 `code` |"].join("\n"));
    const cell = table(blocks).rows[0][0];
    expect(cell.some((node) => node.kind === "strong")).toBe(true);
    expect(cell.some((node) => node.kind === "code")).toBe(true);
  });
});

describe("splitTableRow", () => {
  it("处理外侧竖线与空单元格", () => {
    expect(splitTableRow("| a || b |")).toEqual(["a", "", "b"]);
    expect(splitTableRow("| a | |")).toEqual(["a", ""]);
  });
});

describe("parseMarkdown 列表", () => {
  it("解析任务清单", () => {
    const blocks = parseMarkdown(["- [x] 已完成", "- [ ] 未完成", "- 普通项"].join("\n"));
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("expected list");
    expect(list.items.map((item) => item.checked)).toEqual([true, false, null]);
    expect(inlineText(list.items[0].inline)).toBe("已完成");
  });

  it("解析嵌套列表", () => {
    const blocks = parseMarkdown(["- 父项", "  - 子项一", "  - 子项二", "- 第二父项"].join("\n"));
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("expected list");
    expect(list.items.length).toBe(2);
    const nested = list.items[0].children[0];
    if (nested.kind !== "list") throw new Error("expected nested list");
    expect(nested.items.map((item) => inlineText(item.inline))).toEqual(["子项一", "子项二"]);
  });

  it("首行缩进比后续深时不丢行", () => {
    const blocks = parseMarkdown(["  - 深缩进", "- 浅缩进"].join("\n"));
    const texts = blocks
      .filter((block): block is Extract<BlockNode, { kind: "list" }> => block.kind === "list")
      .flatMap((block) => block.items.map((item) => inlineText(item.inline)));
    expect(texts).toEqual(["深缩进", "浅缩进"]);
  });

  it("支持 1) 风格有序列表", () => {
    const blocks = parseMarkdown(["1) 一", "2) 二"].join("\n"));
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("expected list");
    expect(list.ordered).toBe(true);
  });
});

describe("parseInline", () => {
  it("加粗内可嵌套斜体和行内代码", () => {
    const nodes = parseInline("**加粗 *斜体* 与 `code`**");
    expect(nodes[0].kind).toBe("strong");
    const strong = nodes[0] as Extract<InlineNode, { kind: "strong" }>;
    expect(strong.children.some((node) => node.kind === "em")).toBe(true);
    expect(strong.children.some((node) => node.kind === "code")).toBe(true);
  });

  it("支持删除线", () => {
    const nodes = parseInline("这是 ~~删除~~ 的内容");
    expect(nodes.some((node) => node.kind === "del")).toBe(true);
  });

  it("链接安全性判定", () => {
    const [link] = parseInline("[官网](https://example.com)");
    expect(link).toMatchObject({ kind: "link", safe: true, href: "https://example.com" });
    const [unsafe] = parseInline("[x](javascript:alert(1))");
    expect(unsafe).toMatchObject({ kind: "link", safe: false });
  });

  it("snake_case 不误判为斜体", () => {
    const nodes = parseInline("变量 foo_bar_baz 保持原样");
    expect(inlineText(nodes)).toBe("变量 foo_bar_baz 保持原样");
    expect(nodes.every((node) => node.kind === "text")).toBe(true);
  });

  it("反转义常见符号", () => {
    expect(inlineText(parseInline("\\*not em\\*"))).toBe("*not em*");
  });
});

describe("parseMarkdown 其他块", () => {
  it("~~~ 围栏代码也能识别", () => {
    const blocks = parseMarkdown(["~~~python", "print(1)", "~~~"].join("\n"));
    expect(blocks[0]).toMatchObject({ kind: "codeBlock", lang: "python", text: "print(1)" });
  });

  it("标题允许尾部 #", () => {
    const blocks = parseMarkdown("## 标题 ##");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    if (blocks[0].kind === "heading") expect(inlineText(blocks[0].inline)).toBe("标题");
  });

  it("引用内可以有表格", () => {
    const blocks = parseMarkdown(["> | a |", "> | - |", "> | 1 |"].join("\n"));
    if (blocks[0].kind !== "blockquote") throw new Error("expected blockquote");
    expect(blocks[0].children[0].kind).toBe("table");
  });
});
