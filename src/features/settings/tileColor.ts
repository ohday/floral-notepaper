import type { TileColorMode } from "./types";

export const DEFAULT_TILE_COLOR = "#f6f3ec";
export const SYSTEM_TILE_COLOR_LIGHT = "#f6f3ec";
export const SYSTEM_TILE_COLOR_DARK = "#191919";

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
