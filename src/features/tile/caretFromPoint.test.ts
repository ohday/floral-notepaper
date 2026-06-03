import { describe, expect, test } from "vitest";
import { lineStartOffset, getCaretOffset } from "./caretFromPoint";

describe("lineStartOffset", () => {
  const content = "line one\nline two\nline three";
  // 偏移：0=l, 9=l(line two), 18=l(line three)

  test("line 1 → 0", () => {
    expect(lineStartOffset(content, 1)).toBe(0);
  });

  test("line 2 → 9", () => {
    expect(lineStartOffset(content, 2)).toBe(9);
  });

  test("line 3 → 18", () => {
    expect(lineStartOffset(content, 3)).toBe(18);
  });

  test("行号 0 / 负数 → 0", () => {
    expect(lineStartOffset(content, 0)).toBe(0);
    expect(lineStartOffset(content, -1)).toBe(0);
  });

  test("行号超出 → content.length", () => {
    expect(lineStartOffset(content, 99)).toBe(content.length);
  });

  test("空字符串", () => {
    expect(lineStartOffset("", 1)).toBe(0);
    expect(lineStartOffset("", 5)).toBe(0);
  });

  test("末尾换行的边界", () => {
    expect(lineStartOffset("a\nb\n", 3)).toBe(4); // 第三行（空行）从位置 4
  });
});

/**
 * `offsetWithinRoot` 接受 Node 参数，需要 jsdom 才能测；项目当前 vitest 配置是 node
 * 环境（无 jsdom 依赖）。该函数纯逻辑很简单：TreeWalker 累加 + 命中 target 时加局部
 * offset。集成测试在浏览器实测覆盖（双击进编辑路径）。这里只测整体入口的纯逻辑分支。
 */

describe("getCaretOffset - markdown 行首退化（mock document）", () => {
  test("点击命中 [data-md-line-start='2'] → 返回该行首偏移", () => {
    const content = "line one\nline two\n\n- item";
    const target = {
      closest: (selector: string) =>
        selector === "[data-md-line-start]" ? { dataset: { mdLineStart: "2" } } : null,
    } as unknown as HTMLElement;
    const docMock = { elementFromPoint: () => target } as unknown as Document;
    expect(
      getCaretOffset("markdown", { root: {} as HTMLElement, doc: docMock, x: 0, y: 0, content }),
    ).toBe(9);
  });

  test("命中 data-md-line-start='4'（嵌套元素也走 closest）", () => {
    const content = "line one\nline two\n\n- item";
    const target = {
      closest: (selector: string) =>
        selector === "[data-md-line-start]" ? { dataset: { mdLineStart: "4" } } : null,
    } as unknown as HTMLElement;
    const docMock = { elementFromPoint: () => target } as unknown as Document;
    // 第 4 行 "- item"（前面三行：line one\nline two\n\n）= 8+1+8+1+1 = 19
    expect(
      getCaretOffset("markdown", { root: {} as HTMLElement, doc: docMock, x: 0, y: 0, content }),
    ).toBe(19);
  });

  test("点击没有 data-md-line-start 祖先 → content 末尾", () => {
    const content = "hello";
    const target = { closest: () => null } as unknown as HTMLElement;
    const docMock = { elementFromPoint: () => target } as unknown as Document;
    expect(
      getCaretOffset("markdown", { root: {} as HTMLElement, doc: docMock, x: 0, y: 0, content }),
    ).toBe(content.length);
  });

  test("elementFromPoint 返回 null → 末尾", () => {
    const content = "hello";
    const docMock = { elementFromPoint: () => null } as unknown as Document;
    expect(
      getCaretOffset("markdown", { root: {} as HTMLElement, doc: docMock, x: 0, y: 0, content }),
    ).toBe(content.length);
  });

  test("data-md-line-start 不是合法数字 → 末尾", () => {
    const content = "hello";
    const target = {
      closest: () => ({ dataset: { mdLineStart: "abc" } }),
    } as unknown as HTMLElement;
    const docMock = { elementFromPoint: () => target } as unknown as Document;
    expect(
      getCaretOffset("markdown", { root: {} as HTMLElement, doc: docMock, x: 0, y: 0, content }),
    ).toBe(content.length);
  });
});

describe("getCaretOffset - plain caret API 缺席降级", () => {
  test("doc 没 caretPositionFromPoint / caretRangeFromPoint → content.length", () => {
    const docMock = {} as Document;
    const offset = getCaretOffset("plain", {
      root: {} as HTMLElement,
      doc: docMock,
      x: 0,
      y: 0,
      content: "hello",
    });
    expect(offset).toBe("hello".length);
  });

  test("root 为 null → content.length", () => {
    const docMock = { caretPositionFromPoint: () => null } as unknown as Document;
    const offset = getCaretOffset("plain", {
      root: null,
      doc: docMock,
      x: 0,
      y: 0,
      content: "hello",
    });
    expect(offset).toBe("hello".length);
  });

  test("caretPositionFromPoint 返回 null → content.length", () => {
    const docMock = { caretPositionFromPoint: () => null } as unknown as Document;
    const offset = getCaretOffset("plain", {
      root: {} as HTMLElement,
      doc: docMock,
      x: 0,
      y: 0,
      content: "hello",
    });
    expect(offset).toBe("hello".length);
  });
});
