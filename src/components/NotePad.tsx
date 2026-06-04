import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createNote, getErrorMessage, getNote, listNotes, updateNote } from "../features/notes/api";
import { useImagePaste } from "../features/images/useImagePaste";
import { useImageBaseDir } from "../features/images/useImageBaseDir";
import type { Note, NoteMetadata, TileLayout } from "../features/notes/types";
import {
  countNoteChars,
  formatShortDate,
  getDisplayTitle,
  metadataFromNote,
} from "../features/notes/noteUtils";
import { listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
  type PhysicalPosition,
  type PhysicalSize,
} from "@tauri-apps/api/window";
import {
  animateCurrentWindowBounds,
  closeCurrentWindow,
  getCurrentWindowBounds,
  recycleCurrentNotepad,
  setCurrentWindowAlwaysOnTop,
  showCurrentWindow,
  startCurrentWindowDrag,
  startCurrentWindowResize,
} from "../features/windows/controls";
import { openNoteInEditor } from "../features/windows/api";
import type { ResizeDirection } from "../features/windows/controls";
import { getConfig, saveConfig } from "../features/settings/api";
import {
  DEFAULT_TILE_COLOR,
  normalizeTileColor,
  resolveNoteTileColor,
} from "../features/settings/tileColor";
import type { TileColorMode } from "../features/settings/types";
import { shouldSaveBeforeSwitchingToTile } from "../features/windows/noteSurfaceSavePolicy";
import {
  NOTE_SURFACE_ACTION_EVENT,
  surfaceActionContextFromEvent,
  surfaceActionFromEvent,
} from "../features/windows/surfaceActions";
import {
  NOTE_SURFACE_MODE_EVENT,
  getSurfaceTargetBounds,
  surfaceModeFromEvent,
} from "../features/windows/surfaceMode";
import type { NoteSurfaceMode } from "../features/windows/surfaceMode";
import {
  emitTileWindowUnpinned,
  tileSurfaceModeUnpinNoteId,
} from "../features/windows/tileWindowEvents";
import { handleMarkdownEnter } from "../features/markdown/useMarkdownAutoComplete";
import { useTileDoubleClick } from "../features/tile/useTileDoubleClick";
import { getCaretOffset } from "../features/tile/caretFromPoint";
import { resolveLayoutBounds, type MonitorRect } from "../features/tile/tileLayout";
import { Tile } from "./Tile";
import { TileColorPalette } from "./TileColorPalette";

type OpenMode = "new" | "open";
type NotePadStatus = "empty" | "opened" | "saved" | "dirty" | "saveFailed" | "copied";

interface NotePadProps {
  initialNoteId?: string;
  initialSurfaceMode?: NoteSurfaceMode;
  initialAutoSave?: boolean;
  initialTileColor?: string;
}

const surfaceResizeHandles: Array<{
  direction: ResizeDirection;
  className: string;
  size: string;
}> = [
  {
    direction: "NorthWest",
    size: "w-8 h-8",
    className: "top-0 left-0 cursor-nwse-resize",
  },
  {
    direction: "NorthEast",
    size: "w-5 h-5",
    className: "top-0 right-0 cursor-nesw-resize",
  },
  {
    direction: "SouthWest",
    size: "w-8 h-8",
    className: "bottom-0 left-0 cursor-nesw-resize",
  },
  {
    direction: "SouthEast",
    size: "w-5 h-5",
    className: "bottom-0 right-0 cursor-nwse-resize",
  },
];

function SurfaceResizeHandles() {
  return (
    <>
      {surfaceResizeHandles.map((handle) => (
        <div
          key={handle.direction}
          aria-hidden="true"
          data-surface-resize-handle="true"
          data-resize-direction={handle.direction}
          onMouseDown={(event) => {
            event.stopPropagation();
            void startCurrentWindowResize(handle.direction).catch(() => undefined);
          }}
          className={`absolute ${handle.size} opacity-0 ${handle.className}`}
        />
      ))}
    </>
  );
}

export function NotePad({
  initialNoteId,
  initialSurfaceMode = "pad",
  initialAutoSave = true,
  initialTileColor = DEFAULT_TILE_COLOR,
}: NotePadProps) {
  const { t } = useTranslation();
  const [surfaceMode, setSurfaceMode] = useState<NoteSurfaceMode>(initialSurfaceMode);
  const [mode, setMode] = useState<OpenMode>("new");
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);
  const [status, setStatus] = useState<NotePadStatus>("empty");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noteSurfaceAutoSave, setNoteSurfaceAutoSave] = useState(initialAutoSave);
  const [tileColorRaw, setTileColorRaw] = useState(normalizeTileColor(initialTileColor));
  const [tileColorMode, setTileColorMode] = useState<TileColorMode>("system");
  const [surfaceFontSize, setSurfaceFontSize] = useState(14);
  const [tileRenderMarkdown, setTileRenderMarkdown] = useState(false);
  // 当前打开笔记自带的 tileColor（per-note，最高优先级）；null 表示笔记未自定义
  const [noteTileColor, setNoteTileColor] = useState<string | null>(null);
  /** 当前打开笔记的磁贴布局（per-note 持久化，D5）；null = 未自定义 */
  const [noteTileLayout, setNoteTileLayout] = useState<TileLayout | null>(null);
  const noteTileLayoutRef = useRef<TileLayout | null>(null);
  // 同步 ref，让 onMoved/onResized 闭包看到最新值
  noteTileLayoutRef.current = noteTileLayout;
  const layoutSaveTimerRef = useRef<number | null>(null);
  const [tileEditing, setTileEditing] = useState(false);
  /** 双击进编辑时，期望 textarea 聚焦后停在的字符偏移（D2）。null = 末尾 */
  const [pendingCaretOffset, setPendingCaretOffset] = useState<number | null>(null);
  /** 折叠态（D6）：true 时仅显示标题栏带，正文区隐藏 */
  const [tileCollapsed, setTileCollapsed] = useState(false);
  /** 折叠前的窗口尺寸，展开时还原（暂存于内存；Group 9 接入持久化时由 layout 取代） */
  const preCollapseSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [systemThemeNonce, setSystemThemeNonce] = useState(0);
  // 调色板 popover 状态（D4）
  const [paletteState, setPaletteState] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const tileRootRef = useRef<HTMLDivElement>(null);
  const tileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const colorPersistTimerRef = useRef<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const isStandby = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("standby") === "1",
  );
  const hasEnteredOnce = useRef(false);
  const statusLabel = useMemo<Record<NotePadStatus, string>>(
    () => ({
      empty: t("notepad.status.empty", { defaultValue: "空" }),
      opened: t("notepad.status.opened", { defaultValue: "已打开" }),
      saved: t("notepad.status.saved", { defaultValue: "已保存" }),
      dirty: t("notepad.status.unsaved", { defaultValue: "未保存" }),
      saveFailed: t("notepad.status.saveFailed", { defaultValue: "保存失败" }),
      copied: t("notepad.status.copied", { defaultValue: "已复制" }),
    }),
    [t],
  );
  const tabLabels = useMemo(
    () => ({
      new: t("notepad.tab.new", { defaultValue: "新建" }),
      edit: t("notepad.tab.edit", { defaultValue: "编辑" }),
      open: t("notepad.tab.open", { defaultValue: "打开" }),
    }),
    [t],
  );

  const refreshNotes = useCallback(async () => {
    const loadedNotes = await listNotes();
    setNotes(loadedNotes);
    return loadedNotes;
  }, []);

  const applyNote = useCallback((note: Note) => {
    setEditingNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setNoteTileColor(note.tileColor ?? null);
    setNoteTileLayout(note.tileLayout ?? null);
    setTileCollapsed(note.tileLayout?.collapsed ?? false);
    setMode("new");
    setStatus("opened");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [loadedConfig] = await Promise.all([getConfig(), refreshNotes()]);
        if (!cancelled) {
          setNoteSurfaceAutoSave(loadedConfig.noteSurfaceAutoSave);
          setSurfaceFontSize(loadedConfig.surfaceFontSize ?? 14);
          setTileRenderMarkdown(loadedConfig.tileRenderMarkdown ?? false);
          setTileColorRaw(normalizeTileColor(loadedConfig.tileColor));
          setTileColorMode(loadedConfig.tileColorMode ?? "system");
        }
        if (initialNoteId) {
          const note = await getNote(initialNoteId);
          if (!cancelled) applyNote(note);
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(getErrorMessage(error));
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applyNote, initialNoteId, refreshNotes]);

  useEffect(() => {
    const unlisten = listen("notes-changed", () => {
      void refreshNotes().catch(() => undefined);
      // 同步刷新当前打开笔记的 tileColor（其他窗口可能改了色）
      if (editingNoteId) {
        void getNote(editingNoteId)
          .then((note) => setNoteTileColor(note.tileColor ?? null))
          .catch(() => undefined);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [editingNoteId, refreshNotes]);

  useEffect(() => {
    if (isStandby.current) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          hasEnteredOnce.current = true;
          void showCurrentWindow()
            .then(() => contentRef.current?.focus())
            .catch(() => undefined);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{
      tileColor?: string;
      tileColorMode?: TileColorMode;
      surfaceFontSize?: number;
      tileRenderMarkdown?: boolean;
    }>("config-changed", (event) => {
      const mode = event.payload.tileColorMode ?? tileColorMode;
      const raw = event.payload.tileColor ?? tileColorRaw;
      setTileColorMode(mode);
      setTileColorRaw(normalizeTileColor(raw));
      if (event.payload.surfaceFontSize != null) setSurfaceFontSize(event.payload.surfaceFontSize);
      if (event.payload.tileRenderMarkdown != null)
        setTileRenderMarkdown(event.payload.tileRenderMarkdown);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [tileColorMode, tileColorRaw]);

  useEffect(() => {
    if (tileColorMode !== "system") return;
    const observer = new MutationObserver(() => {
      setSystemThemeNonce((n) => n + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [tileColorMode]);

  useEffect(() => {
    let myLabel = "";
    try {
      myLabel = getCurrentWindow().label;
    } catch {
      // not in Tauri environment (tests)
    }

    const unlisten = listen<string>("notepad:activate", (event) => {
      if (event.payload !== myLabel) return;

      isStandby.current = false;
      hasEnteredOnce.current = true;
      setEditingNoteId(null);
      setTitle("");
      setContent("");
      setNoteTileColor(null);
      setNoteTileLayout(null);
      setTileCollapsed(false);
      setMode("new");
      setStatus("empty");
      setErrorMessage(null);
      setIsExiting(false);
      setSurfaceMode("pad");
      void refreshNotes().catch(() => undefined);
      void showCurrentWindow()
        .then(() => contentRef.current?.focus())
        .catch(() => undefined);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refreshNotes]);

  const saveNote = useCallback(async () => {
    const existingCategory = notes.find((n) => n.id === editingNoteId)?.category ?? "";
    const request = {
      title,
      content,
      category: existingCategory,
      tileColor: noteTileColor ?? undefined,
      tileLayout: noteTileLayout ?? undefined,
    };
    const note = editingNoteId
      ? await updateNote(editingNoteId, request)
      : await createNote(request);

    setEditingNoteId(note.id);
    setNoteTileColor(note.tileColor ?? null);
    setNoteTileLayout(note.tileLayout ?? null);
    setNotes((current) => {
      const metadata = metadataFromNote(note);
      const exists = current.some((item) => item.id === note.id);
      const next = exists
        ? current.map((item) => (item.id === note.id ? metadata : item))
        : [metadata, ...current];
      return [...next].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
    setStatus("saved");
    return note;
  }, [content, editingNoteId, notes, noteTileColor, noteTileLayout, title]);

  const hasDraftContent = useCallback(
    () => Boolean(editingNoteId || title.trim() || content.trim()),
    [content, editingNoteId, title],
  );

  const imageBaseDir = useImageBaseDir();

  const ensureNoteSaved = useCallback(async (): Promise<string | null> => {
    if (editingNoteId) return editingNoteId;
    try {
      const note = await saveNote();
      return note.id;
    } catch {
      return null;
    }
  }, [editingNoteId, saveNote]);

  const {
    handlePaste: imagePasteHandler,
    handleDrop: imageDropHandler,
    handleDragOver: imageDragOverHandler,
  } = useImagePaste({
    noteId: editingNoteId,
    textareaRef: contentRef,
    setContent,
    markDirty: () => setStatus("dirty"),
    onEnsureNoteSaved: ensureNoteSaved,
    onError: setErrorMessage,
    t,
  });

  const tileNoteId = editingNoteId ?? initialNoteId ?? "";

  const switchSurfaceMode = useCallback(
    async (nextMode: NoteSurfaceMode) => {
      const unpinnedNoteId = tileSurfaceModeUnpinNoteId(surfaceMode, nextMode, tileNoteId);
      setSurfaceMode(nextMode);
      if (unpinnedNoteId) {
        void emitTileWindowUnpinned(unpinnedNoteId).catch(() => undefined);
      }

      try {
        if (nextMode === "tile") {
          await setCurrentWindowAlwaysOnTop(true);
        }

        const currentBounds = await getCurrentWindowBounds();
        await animateCurrentWindowBounds(getSurfaceTargetBounds(nextMode, currentBounds));
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    },
    [surfaceMode, tileNoteId],
  );

  useEffect(() => {
    function handleSurfaceModeRequest(event: Event) {
      const nextMode = surfaceModeFromEvent(event);
      if (!nextMode) return;
      void switchSurfaceMode(nextMode);
    }

    window.addEventListener(NOTE_SURFACE_MODE_EVENT, handleSurfaceModeRequest);
    return () => {
      window.removeEventListener(NOTE_SURFACE_MODE_EVENT, handleSurfaceModeRequest);
    };
  }, [switchSurfaceMode]);

  useEffect(() => {
    if (surfaceMode !== "tile") return;
    void setCurrentWindowAlwaysOnTop(true).catch(() => undefined);
  }, [surfaceMode]);

  // 监听 Tauri Window 的 onMoved / onResized，500ms 防抖后写 note.tile_layout（D5）
  useEffect(() => {
    if (surfaceMode !== "tile") return;
    if (!editingNoteId) return;

    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;

    const win = getCurrentWindow();

    const scheduleSave = (next: Partial<TileLayout>) => {
      const prev = noteTileLayoutRef.current ?? {
        x: 0,
        y: 0,
        width: 280,
        height: 280,
        collapsed: tileCollapsed,
      };
      const merged: TileLayout = { ...prev, ...next };
      noteTileLayoutRef.current = merged;
      setNoteTileLayout(merged);
      if (layoutSaveTimerRef.current != null) {
        window.clearTimeout(layoutSaveTimerRef.current);
      }
      layoutSaveTimerRef.current = window.setTimeout(() => {
        // 持久化（debounce 500ms）
        if (!editingNoteId) return;
        const existingCategory = notes.find((n) => n.id === editingNoteId)?.category ?? "";
        void updateNote(editingNoteId, {
          title,
          content,
          category: existingCategory,
          tileLayout: merged,
        }).catch(() => undefined);
      }, 500);
    };

    void win
      .onMoved(({ payload }: { payload: PhysicalPosition }) => {
        scheduleSave({ x: payload.x, y: payload.y });
      })
      .then((un) => {
        unlistenMoved = un;
      })
      .catch(() => undefined);

    void win
      .onResized(({ payload }: { payload: PhysicalSize }) => {
        // 折叠态时不更新 width/height，避免覆盖展开尺寸
        if (tileCollapsed) {
          // 仅在 collapsed 切换时由 toggleCollapse 自己处理
          return;
        }
        scheduleSave({ width: payload.width, height: payload.height });
      })
      .then((un) => {
        unlistenResized = un;
      })
      .catch(() => undefined);

    return () => {
      unlistenMoved?.();
      unlistenResized?.();
      if (layoutSaveTimerRef.current != null) {
        window.clearTimeout(layoutSaveTimerRef.current);
        layoutSaveTimerRef.current = null;
      }
    };
  }, [content, editingNoteId, notes, surfaceMode, tileCollapsed, title]);

  // 进入 tile surface 时应用 layout（含越界检查）
  useEffect(() => {
    if (surfaceMode !== "tile") return;
    const layout = noteTileLayoutRef.current;
    if (!layout) return;

    let cancelled = false;
    (async () => {
      try {
        const monitors = await availableMonitors();
        const primary = await primaryMonitor();
        if (cancelled) return;
        const monitorRects: MonitorRect[] = monitors.map((m) => ({
          position: { x: m.position.x, y: m.position.y },
          size: { width: m.size.width, height: m.size.height },
        }));
        const primaryRect: MonitorRect | null = primary
          ? {
              position: { x: primary.position.x, y: primary.position.y },
              size: { width: primary.size.width, height: primary.size.height },
            }
          : null;
        const bounds = resolveLayoutBounds(layout, monitorRects, primaryRect);
        // 折叠态：高 44 强制；宽度走计算的 bounds.width
        const targetHeight = layout.collapsed ? 44 : bounds.height;
        // 关键：从持久化恢复 collapsed 时，preCollapseSize 也要填上，否则 expand 没数据可还原
        if (layout.collapsed && !preCollapseSizeRef.current) {
          preCollapseSizeRef.current = { width: bounds.width, height: bounds.height };
        }
        await animateCurrentWindowBounds({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: targetHeight,
        }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceMode, editingNoteId]);

  // 切回 pad 时强制退出 tile 编辑模式
  useEffect(() => {
    if (surfaceMode !== "tile") setTileEditing(false);
  }, [surfaceMode]);

  // 进入 tile 编辑模式时聚焦 textarea，按 pendingCaretOffset 定位光标（D2）；null 时落末尾
  useEffect(() => {
    if (!tileEditing) return;
    const ta = tileTextareaRef.current;
    if (!ta) return;
    ta.focus();
    const target =
      pendingCaretOffset != null
        ? Math.max(0, Math.min(ta.value.length, pendingCaretOffset))
        : ta.value.length;
    ta.selectionStart = target;
    ta.selectionEnd = target;
    setPendingCaretOffset(null);
  }, [tileEditing, pendingCaretOffset]);

  // 退出 tile 编辑：监听窗口失焦（用户点磁贴所在 OS 窗口外都会失焦）。
  // 注：document.pointerdown 只能捕获 webview 内的点击，无法响应"点桌面其他地方"。
  // 同时保留 webview 内"点磁贴外部"分支（虽然磁贴几乎占满 webview，但更广义安全）。
  useEffect(() => {
    if (!tileEditing) return;

    let unlistenFocus: (() => void) | null = null;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) setTileEditing(false);
      })
      .then((un) => {
        unlistenFocus = un;
      })
      .catch(() => undefined);

    function onPointerDown(event: PointerEvent) {
      const root = tileRootRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      // 调色板里点击不算外部
      if (target instanceof HTMLElement && target.closest('[data-tile-palette="true"]')) return;
      setTileEditing(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      unlistenFocus?.();
    };
  }, [tileEditing]);

  // 卸载时清理颜色持久化定时器
  useEffect(() => {
    return () => {
      if (colorPersistTimerRef.current != null) {
        window.clearTimeout(colorPersistTimerRef.current);
        colorPersistTimerRef.current = null;
      }
    };
  }, []);

  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    try {
      await saveNote();
    } catch (error) {
      setStatus("saveFailed");
      setErrorMessage(getErrorMessage(error));
    }
  }, [saveNote]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void handleSave();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const handleOpenNote = async (noteId: string) => {
    setErrorMessage(null);
    try {
      const note = await getNote(noteId);
      applyNote(note);
      await switchSurfaceMode("pad");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handlePin = async () => {
    setErrorMessage(null);
    try {
      if (shouldSaveBeforeSwitchingToTile(noteSurfaceAutoSave)) {
        await saveNote();
      }
      await switchSurfaceMode("tile");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleClose = useCallback(() => {
    setIsExiting(true);
    const closeSurface = surfaceMode === "tile" ? closeCurrentWindow : recycleCurrentNotepad;
    void closeSurface().catch((error) => {
      setIsExiting(false);
      setErrorMessage(getErrorMessage(error));
    });
  }, [surfaceMode]);

  const copyTileContent = useCallback(async () => {
    setErrorMessage(null);
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        throw new Error(t("notepad.error.copyUnsupported", { defaultValue: "当前环境不支持复制" }));
      }
      await clipboard.writeText(content);
      setStatus("copied");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [content, t]);

  // 调色板触发：右键菜单 → adjustColor action 携带坐标 → 打开 popover
  const openColorPalette = useCallback((x: number, y: number) => {
    setPaletteState({ open: true, x, y });
  }, []);

  const closeColorPalette = useCallback(() => {
    setPaletteState((prev) => ({ ...prev, open: false }));
  }, []);

  // "自定义颜色…" 入口仍走原生 picker
  const openNativeColorPicker = useCallback(() => {
    const input = colorPickerRef.current;
    if (!input) return;
    input.value = resolveNoteTileColor(noteTileColor, tileColorMode, tileColorRaw);
    input.click();
  }, [noteTileColor, tileColorMode, tileColorRaw]);

  const persistTileColor = useCallback(
    (nextColor: string) => {
      const normalized = normalizeTileColor(nextColor);
      // 写笔记自身（如已保存过）
      if (editingNoteId) {
        const existingCategory = notes.find((n) => n.id === editingNoteId)?.category ?? "";
        void updateNote(editingNoteId, {
          title,
          content,
          category: existingCategory,
          tileColor: normalized,
        }).catch((error) => setErrorMessage(getErrorMessage(error)));
      }
      // 同步写 config 作为"最后调过的色"——仅当 mode 已经是 custom 时；system 模式下不强制切换
      void getConfig()
        .then((cfg) =>
          saveConfig({
            ...cfg,
            tileColor: normalized,
            tileColorMode: cfg.tileColorMode === "system" ? "system" : "custom",
          }),
        )
        .catch(() => undefined);
    },
    [content, editingNoteId, notes, title],
  );

  const handleColorPickerChange = useCallback(
    (next: string) => {
      const normalized = normalizeTileColor(next);
      // 立即视觉反馈：更新 noteTileColor，effectiveTileColor 重算
      setNoteTileColor(normalized);
      // 同时更新 config 级 tileColorRaw，保证不依赖此 note 的渲染（如新磁贴）也跟上
      setTileColorRaw(normalized);
      // 防抖持久化
      if (colorPersistTimerRef.current != null) {
        window.clearTimeout(colorPersistTimerRef.current);
      }
      colorPersistTimerRef.current = window.setTimeout(() => {
        persistTileColor(normalized);
      }, 300);
    },
    [persistTileColor],
  );

  useEffect(() => {
    function handleSurfaceActionRequest(event: Event) {
      const action = surfaceActionFromEvent(event);
      if (!action) return;

      if (action === "copy") {
        void copyTileContent();
        return;
      }

      if (action === "save") {
        void handleSave();
        return;
      }

      if (action === "close") {
        void handleClose();
        return;
      }

      if (action === "adjustColor") {
        const { x, y } = surfaceActionContextFromEvent(event);
        openColorPalette(
          typeof x === "number" ? x : window.innerWidth / 2,
          typeof y === "number" ? y : window.innerHeight / 2,
        );
        return;
      }

      void switchSurfaceMode("pad");
    }

    window.addEventListener(NOTE_SURFACE_ACTION_EVENT, handleSurfaceActionRequest);
    return () => {
      window.removeEventListener(NOTE_SURFACE_ACTION_EVENT, handleSurfaceActionRequest);
    };
  }, [copyTileContent, handleClose, handleSave, openColorPalette, switchSurfaceMode]);

  useEffect(() => {
    if (!noteSurfaceAutoSave || mode !== "new" || status !== "dirty") {
      return undefined;
    }
    if (!hasDraftContent()) return undefined;

    const timer = window.setTimeout(() => {
      void handleSave();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [handleSave, hasDraftContent, mode, noteSurfaceAutoSave, status]);

  const handleDrag = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea")) return;
    void startCurrentWindowDrag().catch(() => undefined);
  };

  // 折叠 / 展开（D6）
  const toggleCollapse = useCallback(async () => {
    const wasCollapsed = tileCollapsed;
    if (!wasCollapsed) {
      // 折叠前：先记下当前尺寸
      try {
        const bounds = await getCurrentWindowBounds();
        preCollapseSizeRef.current = { width: bounds.width, height: bounds.height };
      } catch {
        preCollapseSizeRef.current = null;
      }
      setTileCollapsed(true);
      // 折叠态：窗口高度足以让标题字 + 按钮垂直居中显示。36 太挤字会沉，改用 44。
      // 宽度恢复 v2 初版公式：标题字符估算 + 按钮组 + padding，足够即可。
      const COLLAPSED_HEIGHT = 44;
      const titleLen = title.trim().length;
      const estimatedTitleWidth = (titleLen || 1) * Math.max(8, surfaceFontSize - 2);
      const collapsedWidth = Math.max(120, Math.min(280, estimatedTitleWidth + 100));
      try {
        const bounds = await getCurrentWindowBounds();
        await animateCurrentWindowBounds({
          x: bounds.x,
          y: bounds.y,
          width: collapsedWidth,
          height: COLLAPSED_HEIGHT,
        }).catch(() => undefined);
      } catch {
        /* ignore */
      }
      // 标记 layout.collapsed=true（onResized 内的折叠态 guard 会避免污染 width/height）
      const prev = noteTileLayoutRef.current;
      if (prev) {
        const merged = { ...prev, collapsed: true };
        noteTileLayoutRef.current = merged;
        setNoteTileLayout(merged);
      }
    } else {
      // 展开：还原到 preCollapseSize
      const restore = preCollapseSizeRef.current;
      setTileCollapsed(false);
      if (restore) {
        try {
          const bounds = await getCurrentWindowBounds();
          await animateCurrentWindowBounds({
            x: bounds.x,
            y: bounds.y,
            width: restore.width,
            height: restore.height,
          }).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
      // 标记 layout.collapsed=false
      const prev = noteTileLayoutRef.current;
      if (prev) {
        const merged = { ...prev, collapsed: false };
        noteTileLayoutRef.current = merged;
        setNoteTileLayout(merged);
      }
    }
  }, [surfaceFontSize, tileCollapsed, title]);

  // 磁贴专用双击交互层（D1+D6）：标题栏带 = 折叠/展开；正文区 = 进编辑（D2 光标定位）
  const handleTileDoubleClick = useCallback(
    (event: { clientX: number; clientY: number; target: EventTarget | null }) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // 标题栏带命中 → 折叠 / 展开（无论当前是否在编辑）
      if (target.closest('[data-tile-titlebar="true"]')) {
        // 编辑态下双击标题栏：先退出编辑，再切换折叠
        if (tileEditing) setTileEditing(false);
        void toggleCollapse();
        return;
      }

      // 折叠态下正文不可点（实际上正文已 display:none，理论 unreachable）
      if (tileCollapsed) return;

      // 已在编辑模式：让用户在 textarea 内正常双击（选词），不接管
      if (tileEditing) return;

      // 计算光标偏移（D2）：找最近的 [data-tile-text-root] 决定 plain / markdown 模式
      const root = target.closest<HTMLElement>("[data-tile-text-root]");
      if (root) {
        const mode = root.dataset.tileTextRoot === "markdown" ? "markdown" : "plain";
        const offset = getCaretOffset(mode, {
          root,
          doc: document,
          x: event.clientX,
          y: event.clientY,
          content,
        });
        setPendingCaretOffset(offset);
      } else {
        setPendingCaretOffset(null);
      }
      setTileEditing(true);
    },
    [content, tileCollapsed, tileEditing, toggleCollapse],
  );

  const tileMouse = useTileDoubleClick({ onDoubleClick: handleTileDoubleClick });

  const resetDraft = () => {
    setEditingNoteId(null);
    setTitle("");
    setContent("");
    setNoteTileColor(null);
    setNoteTileLayout(null);
    setTileCollapsed(false);
    setMode("new");
    setStatus("empty");
    setErrorMessage(null);
  };

  const isTile = surfaceMode === "tile";
  const tileTitle = title.trim();
  const enterClass = hasEnteredOnce.current ? "" : "animate-window-enter";
  const surfaceWrapperClassName = `w-full h-screen flex flex-col bg-transparent p-0 ${isExiting ? "animate-window-exit" : enterClass}`;
  const padSurfaceClassName =
    "app-surface-frame relative noise-bg w-full h-full min-h-0 bg-cloud overflow-hidden flex flex-col flex-1 border border-paper-deep/70 shadow-[0_1px_10px_rgba(26,26,24,0.06)] transition-all duration-200 ease-out";

  // 磁贴最终颜色：note.tileColor → config.tileColor → DEFAULT（D4 三段回退）
  // systemThemeNonce 仅用于在 dark/light 主题切换时触发重算
  const effectiveTileColor = useMemo(
    () => resolveNoteTileColor(noteTileColor, tileColorMode, tileColorRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteTileColor, tileColorMode, tileColorRaw, systemThemeNonce],
  );

  return (
    <div className={surfaceWrapperClassName}>
      {isTile ? (
        <div ref={tileRootRef} className="w-full h-full">
          <Tile
            title={tileTitle || undefined}
            content={tileEditing ? "" : errorMessage || content}
            color={effectiveTileColor}
            fontSize={surfaceFontSize}
            renderMarkdown={!tileEditing && !errorMessage && tileRenderMarkdown}
            imageBaseDir={imageBaseDir ?? undefined}
            collapsed={tileCollapsed}
            width="100%"
            className="h-full cursor-default"
            data-surface-mode={surfaceMode}
            data-context-menu="tile"
            data-note-id={tileNoteId}
            onMouseDown={tileMouse.onMouseDown}
          >
            {tileEditing && !tileCollapsed && (
              <div className="absolute inset-0 px-4 pt-10 pb-4 z-0">
                <textarea
                  ref={tileTextareaRef}
                  data-tab-indent="true"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setStatus("dirty");
                  }}
                  onPaste={imagePasteHandler}
                  onDrop={imageDropHandler}
                  onDragOver={imageDragOverHandler}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setTileEditing(false);
                      return;
                    }
                    handleMarkdownEnter(event, {
                      value: content,
                      setValue: (next) => {
                        setContent(next);
                        setStatus("dirty");
                      },
                    });
                  }}
                  className="w-full h-full resize-none outline-none bg-transparent leading-[1.8] whitespace-pre-wrap font-body"
                  style={{
                    fontSize: `${surfaceFontSize}px`,
                    color: "inherit",
                    tabSize: `var(--tab-indent-size, 2)`,
                  }}
                />
              </div>
            )}
            <div
              className="absolute top-0 right-0 z-10 h-8 flex items-center pr-2 gap-1"
              data-tile-titlebar="false"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={t("contextMenu.tile.adjustColor", { defaultValue: "调整颜色…" })}
                title={t("contextMenu.tile.adjustColor", { defaultValue: "调整颜色…" })}
                onClick={(event) => {
                  // 锚定在按钮位置（屏幕坐标），打开调色板
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  openColorPalette(rect.left, rect.bottom + 4);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-full text-ink-ghost/70 hover:text-bamboo hover:bg-bamboo-mist/60 transition-colors cursor-pointer"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                  <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                  <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                  <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.937.75-1.687 1.688-1.687h1.984c3.094 0 5.555-2.461 5.555-5.555C22 6.5 17.5 2 12 2z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t("contextMenu.tile.switchToPad", { defaultValue: "转为小窗" })}
                title={t("contextMenu.tile.switchToPad", { defaultValue: "转为小窗" })}
                onClick={() => void switchSurfaceMode("pad")}
                className="w-6 h-6 flex items-center justify-center rounded-full text-ink-ghost/70 hover:text-bamboo hover:bg-bamboo-mist/60 transition-colors cursor-pointer"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t("contextMenu.tile.close", { defaultValue: "取消钉屏" })}
                title={t("contextMenu.tile.close", { defaultValue: "取消钉屏" })}
                onClick={() => void handleClose()}
                className="w-6 h-6 flex items-center justify-center rounded-full text-ink-ghost/70 hover:text-red-400 hover:bg-danger-bg/80 transition-colors cursor-pointer"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SurfaceResizeHandles />
          </Tile>
          <input
            ref={colorPickerRef}
            type="color"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute opacity-0 pointer-events-none w-0 h-0"
            onChange={(event) => handleColorPickerChange(event.target.value)}
          />
          <TileColorPalette
            open={paletteState.open}
            anchorX={paletteState.x}
            anchorY={paletteState.y}
            currentColor={effectiveTileColor}
            onChange={(hex) => handleColorPickerChange(hex)}
            onPickCustom={openNativeColorPicker}
            onClose={closeColorPalette}
          />
        </div>
      ) : (
        <div className={padSurfaceClassName} data-surface-mode={surfaceMode}>
          <>
            <div
              className="flex items-center justify-between px-4 pt-3 pb-0 cursor-default"
              onMouseDown={handleDrag}
            >
              <div className="flex items-center gap-0.5">
                <button
                  onClick={resetDraft}
                  className={`relative px-3.5 py-1.5 text-[13px] rounded-t-lg transition-all duration-200 cursor-pointer ${
                    mode === "new"
                      ? "text-bamboo font-medium"
                      : "text-ink-ghost hover:text-ink-faint"
                  }`}
                >
                  {editingNoteId ? tabLabels.edit : tabLabels.new}
                  {mode === "new" && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-bamboo rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setMode("open")}
                  className={`relative px-3.5 py-1.5 text-[13px] rounded-t-lg transition-all duration-200 cursor-pointer ${
                    mode === "open"
                      ? "text-bamboo font-medium"
                      : "text-ink-ghost hover:text-ink-faint"
                  }`}
                >
                  {tabLabels.open}
                  {mode === "open" && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-bamboo rounded-full" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void handlePin()}
                  className="group w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer text-ink-ghost hover:text-ink-faint hover:bg-paper-warm"
                  title={t("notepad.tooltip.pinToTile", { defaultValue: "转为磁贴" })}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z" />
                  </svg>
                </button>

                <button
                  onClick={() => void handleClose()}
                  className="group w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:bg-danger-bg hover:text-red-400 transition-all duration-200 cursor-pointer"
                  title={t("notepad.tooltip.close", { defaultValue: "关闭" })}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mx-4 mt-1 h-px bg-paper-deep/50" />

            {mode === "new" ? (
              <div
                data-pad-editor-body="true"
                className="px-4 pt-3 pb-2 flex flex-col flex-1 min-h-0"
              >
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setStatus("dirty");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "ArrowDown") {
                      event.preventDefault();
                      contentRef.current?.focus();
                    }
                  }}
                  placeholder={t("notepad.placeholder.title", { defaultValue: "标题（可选）" })}
                  className="w-full font-display font-medium text-ink placeholder:text-ink-ghost/60 mb-2 tracking-wide shrink-0"
                  style={{ fontSize: `${surfaceFontSize}px` }}
                />

                <textarea
                  ref={contentRef}
                  data-tab-indent="true"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setStatus("dirty");
                  }}
                  onPaste={imagePasteHandler}
                  onDrop={imageDropHandler}
                  onDragOver={imageDragOverHandler}
                  onKeyDown={(event) => {
                    if (
                      handleMarkdownEnter(event, {
                        value: content,
                        setValue: (next) => {
                          setContent(next);
                          setStatus("dirty");
                        },
                      })
                    ) {
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      const ta = contentRef.current;
                      if (ta && ta.selectionStart === ta.selectionEnd) {
                        const textBeforeCursor = content.slice(0, ta.selectionStart);
                        if (!textBeforeCursor.includes("\n")) {
                          event.preventDefault();
                          titleRef.current?.focus();
                        }
                      }
                    }
                  }}
                  placeholder={t("notepad.placeholder.content", { defaultValue: "写点什么……" })}
                  className="w-full flex-1 min-h-0 pb-2 leading-relaxed text-ink-soft font-body placeholder:text-ink-ghost/50"
                  style={{ fontSize: `${surfaceFontSize}px`, tabSize: `var(--tab-indent-size, 2)` }}
                />

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-paper-deep/30 shrink-0">
                  <span className="text-[11px] text-ink-ghost font-mono tabular-nums truncate max-w-[170px]">
                    {errorMessage ??
                      `${countNoteChars(content)} ${t("common.wordCountUnit", { defaultValue: "字" })} · ${statusLabel[status]}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetDraft}
                      className="px-4 py-1.5 text-[12px] text-ink-faint hover:text-ink-soft rounded-lg hover:bg-paper-warm transition-all duration-200 cursor-pointer"
                    >
                      {t("notepad.button.clear", { defaultValue: "清空" })}
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      className="px-4 py-1.5 text-[12px] text-cloud bg-bamboo hover:bg-bamboo-light rounded-lg transition-all duration-200 font-medium cursor-pointer"
                    >
                      {t("common.save", { defaultValue: "保存" })}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2 flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-0.5">
                  {notes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => void handleOpenNote(note.id)}
                      onMouseEnter={() => setHoveredNote(note.id)}
                      onMouseLeave={() => setHoveredNote(null)}
                      className="w-full text-left px-3.5 py-3 rounded-xl transition-all duration-200 cursor-pointer group hover:bg-paper-warm/70"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-display font-medium text-ink-soft group-hover:text-ink transition-colors truncate pr-2">
                          {getDisplayTitle(note)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void openNoteInEditor(note.id);
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded-md text-ink-ghost hover:text-bamboo hover:bg-bamboo-mist/50 transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
                            title={t("notepad.tooltip.openInEditor", {
                              defaultValue: "在编辑器中打开",
                            })}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </button>
                          <span className="text-[11px] text-ink-ghost font-mono tabular-nums">
                            {formatShortDate(note.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-ink-ghost leading-relaxed line-clamp-1 group-hover:text-ink-faint transition-colors">
                        {note.preview || t("common.blankNote", { defaultValue: "空白笔记" })}
                      </p>
                      {hoveredNote === note.id && (
                        <div className="mt-1.5 h-px bg-bamboo/10 transition-all duration-300" />
                      )}
                    </button>
                  ))}
                  {notes.length === 0 && (
                    <div className="px-4 py-8 text-center text-[12px] text-ink-ghost">
                      {t("notepad.emptyState", { defaultValue: "还没有可打开的笔记" })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
          <SurfaceResizeHandles />
        </div>
      )}
    </div>
  );
}
