const assert = require("node:assert/strict");
const test = require("node:test");
const {
  firstOutputDifference,
  normalizeOutput,
  renderMarkdown,
  safeSegment,
  selectInitialSource,
} = require("./session-core");

test("selects a cloud draft before the practice template", () => {
  assert.deepEqual(selectInitialSource("int main() { return 1; }", "template"), {
    sourceCode: "int main() { return 1; }",
    mode: "cloud-draft",
  });
  assert.deepEqual(selectInitialSource(null, "template"), { sourceCode: "template", mode: "template" });
});

test("normalizes judge output and reports the first differing position", () => {
  assert.equal(normalizeOutput("1  \r\n2\r\n"), "1\n2");
  assert.deepEqual(firstOutputDifference("answer\n42", "answer\n41"), {
    line: 2,
    column: 2,
    expectedLine: "42",
    actualLine: "41",
  });
  assert.equal(firstOutputDifference("ok\n", "ok"), null);
});

test("renders safe problem markdown", () => {
  const html = renderMarkdown("# 标题\n\n- 条目\n\n```cpp\n<int>\n```\n<script>alert(1)</script>");
  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /<li>条目<\/li>/);
  assert.match(html, /&lt;int&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("renders inline and display math with KaTeX", () => {
  const html = renderMarkdown("一行包含两个整数 $a$ 和 $b$\n\n$$a^2 + b^2 = c^2$$");
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.doesNotMatch(html, />\$a\$</);
});

test("keeps math delimiters literal in code and currency text", () => {
  const html = renderMarkdown("`$a$` 与价格 $5，又花了 $6\n\n```text\n$b$\n```");
  assert.match(html, /<code>\$a\$<\/code>/);
  assert.match(html, /价格 \$5，又花了 \$6/);
  assert.match(html, /<code>\$b\$<\/code>/);
  assert.doesNotMatch(html, /class="katex"/);
});

test("preserves malformed and unclosed math as readable text", () => {
  const html = renderMarkdown("错误公式 $\\unknown{x}$\n\n$$\n未闭合");
  assert.match(html, /class="math-error"/);
  assert.match(html, /\$\$未闭合/);
});

test("does not trust HTML-capable KaTeX commands", () => {
  const html = renderMarkdown("$\\href{javascript:alert(1)}{点击}$");
  assert.doesNotMatch(html, /href="javascript:/);
});

test("creates filesystem-safe problem slugs", () => {
  assert.equal(safeSegment("W1 / 电话:号码"), "W1---电话-号码");
});
