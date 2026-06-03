import type { TileColorMode } from "./types";

export const DEFAULT_TILE_COLOR = "#f6f3ec";
export const SYSTEM_TILE_COLOR_LIGHT = "#f6f3ec";
export const SYSTEM_TILE_COLOR_DARK = "#191919";

/**
 * 磁贴预设色板（D4，固定 8 色）。
 * 顺序：第一行（浅色）4 个、第二行（深色）4 个。
 * UI 渲染时直接 .slice(0, 4) / .slice(4) 拆行。
 */
export interface TilePresetColor {
  /** 6 位小写 hex（不带 #） */
  hex: string;
  /** i18n key，三个 locale 同步 */
  nameKey: string;
}

export const TILE_PRESET_COLORS: ReadonlyArray<TilePresetColor> = [
  // 第一行：浅色组
  { hex: "fcf9ea", nameKey: "tile.palette.preset.fcf9ea" },
  { hex: "badfdb", nameKey: "tile.palette.preset.badfdb" },
  { hex: "ffbdbd", nameKey: "tile.palette.preset.ffbdbd" },
  { hex: "dde6ed", nameKey: "tile.palette.preset.dde6ed" },
  // 第二行：深色组
  { hex: "ffa4a4", nameKey: "tile.palette.preset.ffa4a4" },
  { hex: "9db2bf", nameKey: "tile.palette.preset.9db2bf" },
  { hex: "526d82", nameKey: "tile.palette.preset.526d82" },
  { hex: "27374d", nameKey: "tile.palette.preset.27374d" },
];

const FULL_HEX_COLOR = /^#?([0-9a-fA-F]{6})$/;
const SHORT_HEX_COLOR = /^#?([0-9a-fA-F]{3})$/;

export function normalizeTileColor(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  const fullMatch = trimmed.match(FULL_HEX_COLOR);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }

  const shortMatch = trimmed.match(SHORT_HEX_COLOR);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((character) => character + character)
      .join("")
      .toLowerCase()}`;
  }

  return DEFAULT_TILE_COLOR;
}

export function resolveSystemTileColor(): string {
  if (typeof document === "undefined") return SYSTEM_TILE_COLOR_LIGHT;
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? SYSTEM_TILE_COLOR_DARK : SYSTEM_TILE_COLOR_LIGHT;
}

export function resolveTileColor(mode: TileColorMode, customColor: string): string {
  return mode === "system" ? resolveSystemTileColor() : normalizeTileColor(customColor);
}

/**
 * 三段回退：note.tileColor → config 级颜色 → DEFAULT_TILE_COLOR。
 * 用于磁贴渲染时决定最终颜色（D4）。
 */
export function resolveNoteTileColor(
  noteTileColor: string | null | undefined,
  configMode: TileColorMode,
  configTileColor: string,
): string {
  const trimmed = noteTileColor?.trim();
  if (trimmed && (FULL_HEX_COLOR.test(trimmed) || SHORT_HEX_COLOR.test(trimmed))) {
    return normalizeTileColor(trimmed);
  }
  return resolveTileColor(configMode, configTileColor);
}
