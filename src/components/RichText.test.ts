import { describe, expect, it } from "vitest";
import { splitMathSegments } from "./RichText";

describe("splitMathSegments", () => {
  it("拆分行内公式与文本", () => {
    expect(splitMathSegments("设 $x^2$ 为平方")).toEqual([
      { kind: "text", text: "设 " },
      { kind: "math", tex: "x^2", display: false },
      { kind: "text", text: " 为平方" },
    ]);
  });

  it("$$...$$ 标记为块级并支持跨行", () => {
    expect(splitMathSegments("推导：\n$$\na+b\n$$\n完毕")).toEqual([
      { kind: "text", text: "推导：\n" },
      { kind: "math", tex: "a+b", display: true },
      { kind: "text", text: "\n完毕" },
    ]);
  });

  it("\\$ 转义为字面量并与相邻文本合并", () => {
    expect(splitMathSegments("价格 \\$100 元")).toEqual([{ kind: "text", text: "价格 $100 元" }]);
  });

  it("货币写法不误判", () => {
    expect(splitMathSegments("花了 $5，又花了 $6")).toEqual([
      { kind: "text", text: "花了 $5，又花了 $6" },
    ]);
  });

  it("未闭合的 $ 保持字面量", () => {
    expect(splitMathSegments("只有一个 $x 符号")).toEqual([
      { kind: "text", text: "只有一个 $x 符号" },
    ]);
  });

  it("falsy 边界：空串返回空数组", () => {
    expect(splitMathSegments("")).toEqual([]);
  });
});
