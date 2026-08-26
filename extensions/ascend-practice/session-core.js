const katex = require("katex");

function normalizeOutput(value) {
  return String(value)
    .replaceAll("\r\n", "\n")
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function firstOutputDifference(expected, actual) {
  const expectedLines = normalizeOutput(expected).split("\n");
  const actualLines = normalizeOutput(actual).split("\n");
  const lineCount = Math.max(expectedLines.length, actualLines.length);
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const expectedLine = expectedLines[lineIndex] ?? "";
    const actualLine = actualLines[lineIndex] ?? "";
    if (expectedLine === actualLine) continue;
    const columnCount = Math.max(expectedLine.length, actualLine.length);
    let columnIndex = 0;
    while (columnIndex < columnCount && expectedLine[columnIndex] === actualLine[columnIndex]) columnIndex += 1;
    return {
      line: lineIndex + 1,
      column: columnIndex + 1,
      expectedLine,
      actualLine,
    };
  }
  return null;
}

function safeSegment(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

function selectInitialSource(draftSourceCode, templateSourceCode) {
  return typeof draftSourceCode === "string" && draftSourceCode.trim()
    ? { sourceCode: draftSourceCode, mode: "cloud-draft" }
    : { sourceCode: String(templateSourceCode || ""), mode: "template" };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "")
    .replaceAll("\r\n", "\n")
    .split("\n");
  const html = [];
  let code = [];
  let codeLanguage = "";
  let inCode = false;
  let math = [];
  let inMath = false;
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushCode = () => {
    html.push(`<pre data-language="${escapeHtml(codeLanguage)}"><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
    codeLanguage = "";
  };
  const flushMath = () => {
    html.push(renderMath(math.join("\n").trim(), true));
    math = [];
  };

  for (const line of lines) {
    if (inMath) {
      if (/\$\$\s*$/.test(line)) {
        math.push(line.replace(/\$\$\s*$/, ""));
        flushMath();
        inMath = false;
      } else {
        math.push(line);
      }
      continue;
    }
    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      if (inCode) flushCode();
      else {
        flushList();
        codeLanguage = fence[1] || "text";
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const singleLineMath = line.match(/^\s*\$\$(.*?)\$\$\s*$/);
    if (singleLineMath) {
      flushList();
      html.push(renderMath(singleLineMath[1].trim(), true));
      continue;
    }
    const mathStart = line.match(/^\s*\$\$(.*)$/);
    if (mathStart) {
      flushList();
      math = mathStart[1] ? [mathStart[1]] : [];
      inMath = true;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(4, heading[1].length + 1);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line.trim()) html.push('<div class="spacer"></div>');
    else html.push(`<p>${renderInline(line)}</p>`);
  }
  flushList();
  if (inCode) flushCode();
  if (inMath) html.push(`<p>${renderInline(`\$\$${math.join("\n")}`)}</p>`);
  return html.join("\n");
}

const INLINE_PATTERN = /(\\.)|(`[^`\n]+`)|(\$\$[^$\n]+?\$\$)|(\$(?!\s)(?:[^$\n]*?[^\s$])\$)|(\*\*.+?\*\*)/g;

function renderInline(value) {
  const text = String(value || "");
  const pattern = new RegExp(INLINE_PATTERN.source, "g");
  const html = [];
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) html.push(escapeHtml(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("\\")) html.push(escapeHtml(token.slice(1)));
    else if (token.startsWith("`")) html.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    else if (token.startsWith("$$")) html.push(renderMath(token.slice(2, -2).trim(), false));
    else if (token.startsWith("$")) html.push(renderMath(token.slice(1, -1).trim(), false));
    else html.push(`<strong>${renderInline(token.slice(2, -2))}</strong>`);
    last = pattern.lastIndex;
  }
  if (last < text.length) html.push(escapeHtml(text.slice(last)));
  return html.join("");
}

function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: true,
      trust: false,
    });
  } catch {
    const delimiter = displayMode ? "$$" : "$";
    return `<span class="math-error" title="公式语法有误">${escapeHtml(`${delimiter}${tex}${delimiter}`)}</span>`;
  }
}

module.exports = {
  escapeHtml,
  firstOutputDifference,
  normalizeOutput,
  renderMarkdown,
  safeSegment,
  selectInitialSource,
};
