import { useCallback, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { startCurrentWindowDrag } from "../windows/controls";

/**
 * 自定义鼠标交互层（D1）：
 *
 * Tauri 的 `startDragging()` 一旦被调，OS 立刻接管鼠标事件——浏览器收不到第二次
 * mousedown，原生 `onDoubleClick` 永远不触发。本 hook 通过：
 *
 * 1. mousedown 时记录起点和时间，**不立即**启动拖拽
 * 2. 监听 window.mousemove，累计位移 > 5px → 此时才 startDragging（已晚一步，但
 *    仍能流畅拖拽；< 5px 的微抖被吞掉）
 * 3. mouseup 时若没拖拽过 → 走 click 路径
 * 4. 自定义双击判定：上次未拖拽 click 与本次间隔 < 400ms = 双击
 *
 * 调用方只需把 hook 返回的 `onMouseDown` 绑到磁贴根 div 上；hook 自动 attach/detach
 * 全局 mousemove + mouseup 监听。双击触发时 `onDoubleClick(event)` 被调用，event
 * 携带原始 mouseup 的 clientX/clientY 和 target，用于光标定位 / 区域分流。
 */

export interface TileDoubleClickEvent {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

export interface UseTileDoubleClickOptions {
  /** 双击触发回调；事件携带触发点坐标 */
  onDoubleClick: (event: TileDoubleClickEvent) => void;
  /** 拖拽阈值（默认 5px）：mousedown 后 |dx|+|dy| 超过此值才 startDragging */
  dragThreshold?: number;
  /** 双击间隔上限（默认 400ms）：两次未拖拽 click 间隔小于此值算双击 */
  doubleClickGap?: number;
  /** 启动拖拽函数；默认调 Tauri startCurrentWindowDrag。注入便于测试 */
  startDragging?: () => Promise<void> | void;
}

/** 内部状态机：仅模块可见，便于纯函数测试 */
export interface ClickJudgment {
  /** 触发了双击吗？*/
  isDoubleClick: boolean;
  /** 更新后的 lastClickAt（毫秒），下一次 mouseup 比较用 */
  nextLastClickAt: number;
}

/**
 * 纯函数：根据本次未拖拽 click 的时间戳和上次时间戳，判断是否为双击。
 * 暴露给单元测试。
 */
export function judgeClick(
  clickAt: number,
  lastClickAt: number,
  doubleClickGap: number,
): ClickJudgment {
  const gap = clickAt - lastClickAt;
  if (lastClickAt > 0 && gap > 0 && gap < doubleClickGap) {
    return { isDoubleClick: true, nextLastClickAt: 0 }; // reset 防止三连点连发两次双击
  }
  return { isDoubleClick: false, nextLastClickAt: clickAt };
}

export interface UseTileDoubleClickReturn {
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
}

export function useTileDoubleClick({
  onDoubleClick,
  dragThreshold = 5,
  doubleClickGap = 400,
  startDragging = startCurrentWindowDrag,
}: UseTileDoubleClickOptions): UseTileDoubleClickReturn {
  const lastClickAtRef = useRef(0);

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      // 仅响应主键（左键）；右键和中键放行
      if (event.button !== 0) return;

      // 编辑器 / 输入框 / 链接 / 按钮自身不接管
      const target = event.target as HTMLElement;
      if (target.closest("button,input,textarea,a,[data-surface-resize-handle]")) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const seqTarget = event.target;
      let hasDragged = false;

      const onMove = (e: globalThis.MouseEvent) => {
        if (hasDragged) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx + dy > dragThreshold) {
          hasDragged = true;
          void Promise.resolve(startDragging()).catch(() => undefined);
        }
      };

      const onUp = (e: globalThis.MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (hasDragged) {
          // 拖拽序列结束；不参与双击计时（重置以防"拖完立刻双击"误判）
          lastClickAtRef.current = 0;
          return;
        }
        const now = performance.now();
        const judgment = judgeClick(now, lastClickAtRef.current, doubleClickGap);
        lastClickAtRef.current = judgment.nextLastClickAt;
        if (judgment.isDoubleClick) {
          onDoubleClick({
            clientX: e.clientX,
            clientY: e.clientY,
            target: seqTarget,
          });
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [doubleClickGap, dragThreshold, onDoubleClick, startDragging],
  );

  return { onMouseDown };
}
