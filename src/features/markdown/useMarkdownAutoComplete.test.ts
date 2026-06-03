import { describe, expect, test } from "vitest";
import { __test } from "./useMarkdownAutoComplete";

const { decideEdit } = __test;

describe("Markdown 自动补全 - 行模式判定", () => {
  describe("无序列表", () => {
    test("非空 `- foo` 行 → 下一行补 `- `", () => {
      expect(decideEdit("- foo")).toEqual({ insert: "\n- " });
    });

    test("缩进 `  - foo` → 下一行保留缩进", () => {
      expect(decideEdit("  - foo")).toEqual({ insert: "\n  - " });
    });

    test("空 `- ` → 替换为缩进（退出列表）", () => {
      expect(decideEdit("- ")).toEqual({ replaceLine: "" });
      expect(decideEdit("  - ")).toEqual({ replaceLine: "  " });
    });
  });

  describe("任务列表（优先级高于普通无序）", () => {
    test("`- [ ] foo` → 下一行补 `- [ ] `", () => {
      expect(decideEdit("- [ ] foo")).toEqual({ insert: "\n- [ ] " });
    });

    test("已勾选 `- [x] foo` → 新项仍未勾选", () => {
      expect(decideEdit("- [x] foo")).toEqual({ insert: "\n- [ ] " });
    });

    test("空 `- [ ] ` → 退出任务列表", () => {
      expect(decideEdit("- [ ] ")).toEqual({ replaceLine: "" });
    });
  });

  describe("有序列表", () => {
    test("`1. foo` → 下一行补 `2. `", () => {
      expect(decideEdit("1. foo")).toEqual({ insert: "\n2. " });
    });

    test("`9. foo` → 下一行补 `10. `", () => {
      expect(decideEdit("9. foo")).toEqual({ insert: "\n10. " });
    });

    test("空 `3. ` → 退出有序列表", () => {
      expect(decideEdit("3. ")).toEqual({ replaceLine: "" });
    });
  });

  describe("引用块", () => {
    test("`> foo` → 下一行补 `> `", () => {
      expect(decideEdit("> foo")).toEqual({ insert: "\n> " });
    });

    test("空 `> ` → 退出引用", () => {
      expect(decideEdit("> ")).toEqual({ replaceLine: "" });
    });
  });

  describe("缩进保留", () => {
    test("`    code` → 下一行保留 4 空格缩进", () => {
      expect(decideEdit("    code")).toEqual({ insert: "\n    " });
    });

    test("Tab 缩进", () => {
      expect(decideEdit("\tcode")).toEqual({ insert: "\n\t" });
    });
  });

  describe("不接管", () => {
    test("普通文本", () => {
      expect(decideEdit("hello world")).toBeNull();
    });

    test("空行", () => {
      expect(decideEdit("")).toBeNull();
    });

    test("仅空白行被识别为缩进保留", () => {
      // 全空白行同样会触发缩进延续（保留视觉层级），不属于"不接管"
      expect(decideEdit("    ")).toEqual({ insert: "\n   " });
    });
  });
});
