import type { TileLayout } from "../notes/types";

/**
 * Tauri Monitor 抽象（仅取需要的字段，便于测试 mock）。
 * 实际类型来自 @tauri-apps/api/window，但我们这里只读 position / size。
 */
export interface MonitorRect {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * 检查布局是否落在任何监视器矩形内。
 * 边界条件：layout.x + 50 必须在某个 monitor 的 [x, x + width) 内，且
 *           layout.y 必须在 [y, y + height) 内。
 * 这样防止"磁贴左 50px 露在屏幕外"的视觉违和。
 */
export function isLayoutInMonitor(layout: TileLayout, monitor: MonitorRect): boolean {
  const probeX = layout.x + 50;
  return (
    probeX >= monitor.position.x &&
    probeX < monitor.position.x + monitor.size.width &&
    layout.y >= monitor.position.y &&
    layout.y < monitor.position.y + monitor.size.height
  );
}

/**
 * 根据布局和监视器列表，决定最终应用的 bounds。
 * - 落在任意 monitor 内 → 直接用 layout
 * - 都不在 → 主屏右下角，保留原 size
 * - monitors 为空 → 直接用 layout（不抛异常，让 Tauri 自己处理）
 */
export function resolveLayoutBounds(
  layout: TileLayout,
  monitors: ReadonlyArray<MonitorRect>,
  primary: MonitorRect | null,
): { x: number; y: number; width: number; height: number } {
  if (monitors.length === 0) {
    return { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  }
  const inside = monitors.some((m) => isLayoutInMonitor(layout, m));
  if (inside) {
    return { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  }
  // 落在所有 monitor 之外 → 回退主屏右下角
  const fallbackMonitor = primary ?? monitors[0];
  const margin = 20;
  return {
    x: fallbackMonitor.position.x + fallbackMonitor.size.width - layout.width - margin,
    y: fallbackMonitor.position.y + fallbackMonitor.size.height - layout.height - margin,
    width: layout.width,
    height: layout.height,
  };
}
