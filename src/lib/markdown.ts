/**
 * 轻量 Markdown 解析器：把文本解析成结构化块节点，由 AssetViewer 渲染成 React 元素。
 * 不产出 HTML 字符串、不经过 innerHTML，无 XSS 面。
 * 支持：标题、围栏代码、分隔线、引用、有序/无序/任务/嵌套列表、GFM 表格、
 * 行内代码/加粗/斜体/删除线/链接（图片降级为链接）。
 */

export type Align = "left" | "center" | "right" | null;

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "em"; children: InlineNode[] }
  | { kind: "del"; children: InlineNode[] }
  | { kind: "link"; href: string; label: string; safe: boolean };

export type ListItem = {
  /** null = 普通列表项；true/false = 任务清单项 */
  checked: boolean | null;
  inline: InlineNode[];
  /** 嵌套子列表 */
  children: BlockNode[];
};

export type BlockNode =
  | { kind: "heading"; level: number; inline: InlineNode[] }
  | { kind: "codeBlock"; lang: string; text: string }
  | { kind: "hr" }
  | { kind: "blockquote"; children: BlockNode[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; align: Align[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { kind: "paragraph"; inline: InlineNode[] };

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK_PREFIX = /^\[( |x|X)\]\s+/;

export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*(\S*)\s*$/);
    if (fence) {
      const marker = fence[1][0] === "`" ? /^\s*```/ : /^\s*~~~/;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !marker.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "codeBlock", lang: fence[2], text: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, inline: parseInline(heading[2]) });
      index += 1;
      continue;
    }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", children: parseMarkdown(quote.join("\n")) });
      continue;
    }

    if (LIST_LINE.test(line)) {
      const collected: RawListLine[] = [];
      while (index < lines.length && LIST_LINE.test(lines[index])) {
        const match = lines[index].match(LIST_LINE)!;
        collected.push({
          indent: match[1].replace(/\t/g, "  ").length,
          ordered: /^\d/.test(match[2]),
          text: match[3],
        });
        index += 1;
      }
      const cursor = { value: 0 };
      while (cursor.value < collected.length) {
        blocks.push(buildList(collected, cursor, collected[cursor.value].indent));
      }
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitTableRow(line).map(parseInline);
      const align = splitTableRow(lines[index + 1]).map(parseAlign);
      index += 2;
      const rows: InlineNode[][][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const cells = splitTableRow(lines[index]);
        // GFM 语义：短行补空、长行截断，保证与表头列数一致
        while (cells.length < header.length) cells.push("");
        rows.push(cells.slice(0, header.length).map(parseInline));
        index += 1;
      }
      blocks.push({ kind: "table", align, header, rows });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|\s*(```|~~~)|\s*>\s?|\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[index]) &&
      !LIST_LINE.test(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

type RawListLine = { indent: number; ordered: boolean; text: string };

function buildList(lines: RawListLine[], cursor: { value: number }, indent: number): BlockNode {
  const ordered = lines[cursor.value].ordered;
  const items: ListItem[] = [];

  while (cursor.value < lines.length && lines[cursor.value].indent >= indent) {
    if (lines[cursor.value].indent > indent) {
      const child = buildList(lines, cursor, lines[cursor.value].indent);
      if (items.length) {
        items[items.length - 1].children.push(child);
      } else {
        items.push({ checked: null, inline: [], children: [child] });
      }
      continue;
    }
    const raw = lines[cursor.value];
    cursor.value += 1;
    const task = raw.text.match(TASK_PREFIX);
    items.push({
      checked: task ? task[1].toLowerCase() === "x" : null,
      inline: parseInline(task ? raw.text.replace(TASK_PREFIX, "") : raw.text),
      children: [],
    });
  }

  return { kind: "list", ordered, items };
}

/* ---------- GFM 表格 ---------- */

export function isTableStart(lines: string[], index: number): boolean {
  const line = lines[index];
  if (!line || !line.includes("|")) return false;
  const next = lines[index + 1];
  if (!next || !isDelimiterRow(next)) return false;
  return splitTableRow(line).length === splitTableRow(next).length;
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes("-") || !line.includes("|")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/** 拆分表格行：忽略行内代码里的竖线；GFM 语义下 `\|` 在拆列阶段就还原成字面量 `|`（包括代码里） */
export function splitTableRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\" && text[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() || !text.endsWith("|")) cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseAlign(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/* ---------- 行内解析 ---------- */

// 顺序：转义 > 行内代码 > 图片/链接 > 加粗 > 删除线 > 斜体
const INLINE_PATTERN =
  /(\\.)|(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\*\*.+?\*\*)|(~~.+?~~)|(\*[^*\s](?:[^*]*[^*\s])?\*)/g;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = new RegExp(INLINE_PATTERN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) pushText(nodes, text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("\\")) {
      pushText(nodes, token);
    } else if (token.startsWith("`")) {
      nodes.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      nodes.push({ kind: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("~~")) {
      nodes.push({ kind: "del", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("*")) {
      nodes.push({ kind: "em", children: parseInline(token.slice(1, -1)) });
    } else {
      const link = token.match(/^(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
      if (link) {
        const [, , label, href] = link;
        nodes.push({
          kind: "link",
          href,
          label: label || href,
          safe: /^(https?:|mailto:|#)/i.test(href),
        });
      } else {
        pushText(nodes, token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) pushText(nodes, text.slice(last));
  return nodes;
}

function pushText(nodes: InlineNode[], raw: string) {
  // 反转义常见符号：\| \* \` \_ \[ \] 等
  const text = raw.replace(/\\([\\`*_[\](){}#+\-.!|~<>])/g, "$1");
  if (!text) return;
  const lastNode = nodes[nodes.length - 1];
  if (lastNode && lastNode.kind === "text") {
    lastNode.text += text;
  } else {
    nodes.push({ kind: "text", text });
  }
}
