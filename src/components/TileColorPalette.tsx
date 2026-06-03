import { useEffect, useMemo, useRef } from "react";
import chroma from "chroma-js";
import { useTranslation } from "react-i18next";
import { TILE_PRESET_COLORS, normalizeTileColor } from "../features/settings/tileColor";

export interface TileColorPaletteProps {
  open: boolean;
  /** 锚点（屏幕坐标，常来自右键事件 clientX/clientY） */
  anchorX: number;
  anchorY: number;
  /** 当前生效的磁贴色（用于标记 ✓） */
  currentColor: string;
  /** 选中预设色 → 立即应用并关闭 */
  onChange: (hex: string) => void;
  /** 用户点"自定义颜色…" */
  onPickCustom: () => void;
  /** 任何方式关闭 popover（外部点击、Esc、选色后） */
  onClose: () => void;
}

const POPOVER_WIDTH = 240;
const POPOVER_PADDING = 12;

/**
 * 固定 8 色调色板 popover（D4）。
 * 锚定在 (anchorX, anchorY)，靠右下偏移；越界时自动调整到屏幕内。
 */
export function TileColorPalette({
  open,
  anchorX,
  anchorY,
  currentColor,
  onChange,
  onPickCustom,
  onClose,
}: TileColorPaletteProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  const normalizedCurrent = useMemo(
    () => normalizeTileColor(currentColor).replace(/^#/, "").toLowerCase(),
    [currentColor],
  );

  // 点外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // 靠右下偏移；越界时反向钳制
  const viewportW = typeof window !== "undefined" ? window.innerWidth : POPOVER_WIDTH;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : POPOVER_WIDTH;
  const offsetX = 4;
  const offsetY = 4;
  let left = anchorX + offsetX;
  let top = anchorY + offsetY;
  if (left + POPOVER_WIDTH + POPOVER_PADDING > viewportW) {
    left = Math.max(POPOVER_PADDING, anchorX - POPOVER_WIDTH - offsetX);
  }
  if (top + 200 > viewportH) {
    top = Math.max(POPOVER_PADDING, anchorY - 200 - offsetY);
  }

  const row1 = TILE_PRESET_COLORS.slice(0, 4);
  const row2 = TILE_PRESET_COLORS.slice(4);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("tile.palette.title", { defaultValue: "选择磁贴颜色" })}
      data-tile-palette="true"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left,
        top,
        width: POPOVER_WIDTH,
        zIndex: 50,
      }}
      className="rounded-xl border border-paper-deep/60 bg-cloud shadow-[0_8px_32px_rgba(26,26,24,0.18)] p-3 select-none"
    >
      <div className="text-[11px] text-ink-faint font-display tracking-wide mb-2 px-0.5">
        {t("tile.palette.title", { defaultValue: "选择磁贴颜色" })}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[...row1, ...row2].map((preset) => {
          const isSelected = preset.hex === normalizedCurrent;
          const checkColor = chroma
            .mix(
              `#${preset.hex}`,
              chroma(`#${preset.hex}`).luminance() > 0.5 ? "#1a1a18" : "#ffffff",
              0.78,
            )
            .alpha(0.95)
            .css();
          return (
            <button
              key={preset.hex}
              type="button"
              title={t(preset.nameKey, { defaultValue: preset.hex })}
              onClick={() => {
                onChange(`#${preset.hex}`);
                onClose();
              }}
              className={`relative w-9 h-9 rounded-lg transition-all duration-150 cursor-pointer hover:scale-[1.08] hover:shadow-[0_2px_8px_rgba(26,26,24,0.2)] ${
                isSelected
                  ? "ring-2 ring-bamboo ring-offset-1 ring-offset-cloud"
                  : "ring-1 ring-paper-deep/40"
              }`}
              style={{ backgroundColor: `#${preset.hex}` }}
            >
              {isSelected && (
                <svg
                  className="absolute inset-0 m-auto"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={checkColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-paper-deep/30">
        <button
          type="button"
          onClick={() => {
            onPickCustom();
            onClose();
          }}
          className="w-full px-2 py-1.5 text-left text-[12px] text-ink-soft hover:bg-paper-warm rounded-md transition-colors duration-150 cursor-pointer"
        >
          {t("tile.palette.custom", { defaultValue: "自定义颜色…" })}
        </button>
      </div>
    </div>
  );
}
