import { describe, expect, test } from "vitest";
import { isLayoutInMonitor, resolveLayoutBounds, type MonitorRect } from "./tileLayout";
import type { TileLayout } from "../notes/types";

const PRIMARY: MonitorRect = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
};
const SECONDARY: MonitorRect = {
  position: { x: 1920, y: 0 },
  size: { width: 2560, height: 1440 },
};

function layout(x: number, y: number): TileLayout {
  return { x, y, width: 280, height: 280, collapsed: false };
}

describe("isLayoutInMonitor", () => {
  test("布局完全在主屏内 → true", () => {
    expect(isLayoutInMonitor(layout(100, 100), PRIMARY)).toBe(true);
  });

  test("布局 x 偏左但 +50 仍在屏内 → true", () => {
    expect(isLayoutInMonitor(layout(-30, 100), PRIMARY)).toBe(true);
  });

  test("布局 x 太靠左 → false", () => {
    expect(isLayoutInMonitor(layout(-100, 100), PRIMARY)).toBe(false);
  });

  test("布局 y 在屏外 → false", () => {
    expect(isLayoutInMonitor(layout(100, -10), PRIMARY)).toBe(false);
    expect(isLayoutInMonitor(layout(100, 1100), PRIMARY)).toBe(false);
  });

  test("副屏布局对主屏 → false", () => {
    expect(isLayoutInMonitor(layout(2000, 100), PRIMARY)).toBe(false);
  });

  test("副屏布局对副屏 → true", () => {
    expect(isLayoutInMonitor(layout(2000, 100), SECONDARY)).toBe(true);
  });
});

describe("resolveLayoutBounds", () => {
  test("布局在某个 monitor 内 → 直接返回 layout", () => {
    const result = resolveLayoutBounds(layout(100, 200), [PRIMARY, SECONDARY], PRIMARY);
    expect(result).toEqual({ x: 100, y: 200, width: 280, height: 280 });
  });

  test("副屏布局，副屏被拔 → 回退主屏右下角", () => {
    const result = resolveLayoutBounds(layout(2500, 500), [PRIMARY], PRIMARY);
    // 主屏右下：1920 - 280 - 20 = 1620；1080 - 280 - 20 = 780
    expect(result).toEqual({ x: 1620, y: 780, width: 280, height: 280 });
  });

  test("monitors 为空 → 直接用 layout", () => {
    const result = resolveLayoutBounds(layout(100, 200), [], null);
    expect(result).toEqual({ x: 100, y: 200, width: 280, height: 280 });
  });

  test("primary 为 null 但有 monitors → 用 monitors[0] 作为回退基准", () => {
    const result = resolveLayoutBounds(layout(99999, 99999), [PRIMARY], null);
    expect(result).toEqual({ x: 1620, y: 780, width: 280, height: 280 });
  });

  test("布局尺寸大于回退屏 → 仍计算（结果可能为负，由调用方/系统裁剪）", () => {
    const tinyMonitor: MonitorRect = {
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
    };
    const big = { ...layout(99999, 99999), width: 200, height: 200 };
    const result = resolveLayoutBounds(big, [tinyMonitor], tinyMonitor);
    expect(result).toEqual({ x: -120, y: -120, width: 200, height: 200 });
  });
});
