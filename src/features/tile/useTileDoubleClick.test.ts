import { describe, expect, test } from "vitest";
import { judgeClick } from "./useTileDoubleClick";

describe("useTileDoubleClick - judgeClick 纯函数", () => {
  const GAP = 400;

  test("第一次 click（lastClickAt=0）→ 不是双击，记下 lastClickAt", () => {
    expect(judgeClick(1000, 0, GAP)).toEqual({
      isDoubleClick: false,
      nextLastClickAt: 1000,
    });
  });

  test("两次 click 间隔 < 400ms → 双击", () => {
    expect(judgeClick(1300, 1000, GAP)).toEqual({
      isDoubleClick: true,
      nextLastClickAt: 0, // 重置，防止三连点连发
    });
  });

  test("两次 click 间隔 = 400ms → 不双击（边界）", () => {
    expect(judgeClick(1400, 1000, GAP)).toEqual({
      isDoubleClick: false,
      nextLastClickAt: 1400,
    });
  });

  test("两次 click 间隔 > 400ms → 不双击", () => {
    expect(judgeClick(1500, 1000, GAP)).toEqual({
      isDoubleClick: false,
      nextLastClickAt: 1500,
    });
  });

  test("三连点：第二次双击触发后第三次重新计时", () => {
    // 第一次
    let r = judgeClick(1000, 0, GAP);
    expect(r.isDoubleClick).toBe(false);
    let last = r.nextLastClickAt;
    // 第二次 → 双击
    r = judgeClick(1200, last, GAP);
    expect(r.isDoubleClick).toBe(true);
    last = r.nextLastClickAt;
    expect(last).toBe(0);
    // 第三次：因 last 被重置为 0，不算双击
    r = judgeClick(1300, last, GAP);
    expect(r.isDoubleClick).toBe(false);
  });

  test("时间倒流（异常）→ 不双击", () => {
    expect(judgeClick(500, 1000, GAP)).toEqual({
      isDoubleClick: false,
      nextLastClickAt: 500,
    });
  });
});
