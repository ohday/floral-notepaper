import { describe, expect, test } from "vitest";
import {
  DEFAULT_TILE_COLOR,
  normalizeTileColor,
  resolveNoteTileColor,
  SYSTEM_TILE_COLOR_LIGHT,
} from "./tileColor";

describe("tile color settings", () => {
  test("normalizes full and shorthand hex colors", () => {
    expect(normalizeTileColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeTileColor("abc")).toBe("#aabbcc");
  });

  test("falls back to the default tile color for invalid values", () => {
    expect(DEFAULT_TILE_COLOR).toBe("#f6f3ec");
    expect(normalizeTileColor("")).toBe(DEFAULT_TILE_COLOR);
    expect(normalizeTileColor("#12zz99")).toBe(DEFAULT_TILE_COLOR);
  });

  describe("resolveNoteTileColor (D4 三段回退)", () => {
    test("note.tileColor 有效时优先使用", () => {
      expect(resolveNoteTileColor("#abcdef", "custom", "#cccccc")).toBe("#abcdef");
    });

    test("note.tileColor 无效或为空时回退到 config", () => {
      expect(resolveNoteTileColor(null, "custom", "#aabbcc")).toBe("#aabbcc");
      expect(resolveNoteTileColor(undefined, "custom", "#aabbcc")).toBe("#aabbcc");
      expect(resolveNoteTileColor("", "custom", "#aabbcc")).toBe("#aabbcc");
      expect(resolveNoteTileColor("garbage", "custom", "#aabbcc")).toBe("#aabbcc");
    });

    test("config 为 system 模式时返回系统色", () => {
      expect(resolveNoteTileColor(null, "system", "#aabbcc")).toBe(SYSTEM_TILE_COLOR_LIGHT);
    });

    test("note.tileColor 为短 hex 时被规范化", () => {
      expect(resolveNoteTileColor("abc", "custom", "#cccccc")).toBe("#aabbcc");
    });
  });
});
