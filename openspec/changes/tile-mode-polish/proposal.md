## Why

上一轮 `tile-mode-optimizations` 让磁贴可编辑、可调色，但实测发现五处明显的体验问题：

- 磁贴的 `onMouseDown` 立刻调 `startCurrentWindowDrag()`，OS 接管鼠标后第二次 mousedown 不到达浏览器，**双击进入编辑根本没生效**
- 即便能进编辑，光标只能落在内容末尾——用户实际想"双击哪里就从那里改"
- 标题颜色公式 `mix 0.6 alpha 0.85` 比正文 `mix 0.65 alpha 0.85` 还浅一档，标题反而比正文淡
- 调色用原生 `<input type="color">`，跨平台 UI 难看且不符合磁贴整体审美；用户想要"几个固定预设"的轻松选择
- 磁贴的位置 / 尺寸是全局共享的（`AppConfig.surface_width/height` 一份）——把笔记 A 拖到屏幕右下、关掉、再开笔记 B，B 也跑右下，违反"一便签一格"的直觉

外加一个补充功能：双击磁贴顶部"标题栏"折叠为窄条（macOS Stickies 风格），方便桌面塞更多笔记。

## What Changes

- **修复**：磁贴双击不进编辑模式 — 自定义鼠标交互层（mousedown 移动 5px 阈值才启动拖拽 + 自定义双击判定 < 400ms）
- **新增**：双击进编辑时光标定位到点击字符位置（纯文本精确定位；Markdown 退化为点击行的行首）
- **修改**：标题颜色公式 `mix 0.6 alpha 0.85` → `mix 0.78 alpha 0.95`，比正文略深，符合 typography 惯例
- **新增**：固定 8 色调色板（FCF9EA / BADFDB / FFA4A4 / FFBDBD / DDE6ED / 9DB2BF / 526D82 / 27374D），2×4 网格 popover，锚定在右键菜单触发位置；保留"自定义颜色…"作为兜底
- **新增**：磁贴位置 + 尺寸 + 折叠状态 per-note 持久化（`NoteMetadata.tile_layout`），重启后恢复；多显示器 / 屏幕变化时落屏外坐标自动回退
- **修改**：`AppConfig.surface_width/height` 语义改为「默认尺寸」，仅 pad 模式写入；tile 模式写 `tile_layout`
- **新增**：双击磁贴顶部 32px 标题栏带 → 折叠为窄条（高 32px、宽 = max(120, 标题宽 + 关闭按钮 + 16px)）；再双击展开

## Capabilities

### New Capabilities

- `note-tile-layout`: 笔记级磁贴布局（位置、尺寸、折叠状态）的持久化、回退与屏幕越界兜底
- `tile-collapse`: 双击标题栏带在"完整磁贴 ⇄ 标题栏窄条"两态之间切换的视觉与窗口尺寸联动

### Modified Capabilities

- `tile-mode`: 双击进入编辑的实现重写为自定义交互层；编辑时光标按双击位置定位；调色入口由原生 picker 改为固定调色板 popover；标题颜色公式加深一档

## Impact

- **前端**
  - 新文件 `src/features/tile/useTileDoubleClick.ts` — 自定义 mousedown / move / up + click 判定 hook，吞掉 Tauri startDragging 提前介入的副作用
  - 新文件 `src/components/TileColorPalette.tsx` — 8 色 popover 网格 + "自定义颜色…"入口，受控组件
  - 新文件 `src/features/tile/caretFromPoint.ts` — 把 (clientX, clientY) → textarea selectionStart（纯文本路径用 `caretPositionFromPoint` / `caretRangeFromPoint` 兼容；Markdown 路径退化为行首）
  - `src/components/Tile.tsx` 顶部增加 32px 标题栏带（绝对定位，不影响内容布局）；标题字段渲染挪入该带；双击事件按区域分流：标题栏带 = 折叠 / 展开，正文区 = 进编辑
  - `src/components/NotePad.tsx` 替换 `handleDrag` 为 hook 提供的 props；新增 collapsed 状态、layout 监听器、palette 显示状态
  - `src/features/settings/tileColor.ts` 增加 `TILE_PRESET_COLORS` 常量数组
  - `src/features/notes/types.ts` 增加 `TileLayout` 类型
- **后端 Rust**
  - `src-tauri/src/services/notes.rs` — `Note` / `NoteMetadata` / `SaveNoteRequest` 新增 `tile_layout: Option<TileLayout>`，`#[serde(default, skip_serializing_if = "Option::is_none")]`，零迁移
  - `src-tauri/src/desktop.rs` — `surface_width/height` 自动写入限制为 pad 窗口；tile 窗口的 moved/resized 由前端 debounce 后写 metadata
- **i18n**
  - 三个 locale（zh-CN / zh-HK / en-US）新增 `tile.palette.custom` 和 `tile.palette.title`（"选择磁贴颜色"标题）
- **测试**
  - 新增 `useTileDoubleClick.test.ts` — drag 阈值、双击间隔、序列重置
  - 新增 `caretFromPoint.test.ts` — 纯文本路径、Markdown 行首退化
  - 新增 `tileLayout.test.ts` — 屏幕越界回退、None 默认值
  - 现有 `tileColor.test.ts` 加预设色卡常量校验
- **不动**
  - 全局快捷键、托盘菜单、设置面板大结构、Markdown 自动补全 hook、磁贴边框 / 四角 / 字体
