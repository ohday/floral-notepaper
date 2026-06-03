export type NoteSurfaceAction = "copy" | "save" | "switchToPad" | "close" | "adjustColor";

export const NOTE_SURFACE_ACTION_EVENT = "floral-notepaper:surface-action";

export interface SurfaceActionContext {
  /** 触发该 action 的屏幕坐标（如右键事件 clientX/clientY），用于锚定弹层 */
  x?: number;
  y?: number;
}

export function isNoteSurfaceAction(value: unknown): value is NoteSurfaceAction {
  return (
    value === "copy" ||
    value === "save" ||
    value === "switchToPad" ||
    value === "close" ||
    value === "adjustColor"
  );
}

export function requestSurfaceAction(
  action: NoteSurfaceAction,
  context?: SurfaceActionContext,
): void {
  window.dispatchEvent(
    new CustomEvent(NOTE_SURFACE_ACTION_EVENT, { detail: { action, context: context ?? {} } }),
  );
}

export function surfaceActionFromEvent(event: Event): NoteSurfaceAction | null {
  if (!(event instanceof CustomEvent)) return null;
  const action = (event.detail as { action?: unknown } | null)?.action;
  return isNoteSurfaceAction(action) ? action : null;
}

export function surfaceActionContextFromEvent(event: Event): SurfaceActionContext {
  if (!(event instanceof CustomEvent)) return {};
  const ctx = (event.detail as { context?: SurfaceActionContext } | null)?.context;
  return ctx ?? {};
}
