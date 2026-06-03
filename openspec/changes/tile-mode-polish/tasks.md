## 1. 标题颜色公式加深（D3，先发，独立可回滚）

- [x] 1.1 `Tile.tsx` 第 93 行 `titleColor` 改为 `chroma.mix(tileColor, mixTarget, 0.78).alpha(0.95).css()`
- [x] 1.2 视觉验证：8 个预设色 + 现有 light/dark 默认色下标题深度 > 正文深度
- [x] 1.3 commit + 阶段性 `npm run tauri build`

## 2. 调色板预设常量与 i18n（D4 铺底）

- [x] 2.1 `src/features/settings/tileColor.ts` 新增 `TILE_PRESET_COLORS: ReadonlyArray<{ hex: string; nameKey: string }>`，8 条按 explore 阶段顺序
- [x] 2.2 `tileColor.test.ts` 新增"预设色卡常量校验"用例（长度 == 8、hex 集合匹配）
- [x] 2.3 三个 locale（zh-CN / zh-HK / en-US）新增 `tile.palette.title`、`tile.palette.custom` 与 8 条 `tile.palette.preset.<hex>`
- [x] 2.4 `resources.test.ts` 通过（三 locale key 总数一致）

## 3. 调色板 popover 组件（D4）

- [x] 3.1 新建 `src/components/TileColorPalette.tsx`，受控组件 props：`{ open, anchorX, anchorY, currentColor, onChange(hex), onPickCustom(), onClose }`
- [x] 3.2 网格布局（2 行 4 列）+ 当前色卡 ✓ 标记 + 自定义颜色入口
- [x] 3.3 内部行为：点外部 / Esc / 选色 → onClose；用 `pointerdown` capture 监听 + ref 隔离
- [x] 3.4 `NotePad.tsx` 替换 `openColorPicker` 逻辑：右键 adjustColor → setPaletteState({ open: true, x, y })，原 colorPickerRef.current.click() 改为由 palette 的 `onPickCustom` 触发
- [x] 3.5 视觉对齐：popover 阴影 / 圆角与现有 Tile 风格一致；色卡 hover 反馈

## 4. 双击交互层重写（D1，依赖：D3 + D4 已稳定）

- [x] 4.1 新建 `src/features/tile/useTileDoubleClick.ts`，hook 签名 `useTileDoubleClick({ onDoubleClick(event) }) → { onMouseDown }`
- [x] 4.2 实现状态机：mousedown 记录起点 → mousemove > 5px 启动 startCurrentWindowDrag → mouseup 检查 hasDragged + 时间间隔
- [x] 4.3 mousemove / mouseup 监听 attach 到 window（而非 element）以避免 mouse 离开元素后丢事件；序列结束时 detach
- [x] 4.4 新建 `useTileDoubleClick.test.ts`，覆盖：单击不拖、轻拖（4px 不拖）、5px 之后拖、双击（< 400ms）、双击间隔 ≥ 400ms 不触发、拖拽序列后下一次双击重新计时
- [x] 4.5 `NotePad.tsx` 替换 `handleDrag` 为 hook 提供的 `onMouseDown`；删除 `onDoubleClick={...}` 直接调用，改由 hook 回调统一驱动
- [x] 4.6 验证：手动测试 — 双击磁贴正文真的进编辑（v1 主诉求修复）

## 5. 双击位置 → 光标定位（D2）

- [x] 5.1 新建 `src/features/tile/caretFromPoint.ts`，导出 `getCaretCharOffset(rootEl, x, y, content)` 纯函数
- [x] 5.2 实现纯文本路径：caretPositionFromPoint → caretRangeFromPoint 兜底 → TreeWalker 累加文本节点偏移
- [x] 5.3 实现 Markdown 行首退化路径：找 `[data-md-line-start]` 祖先 → 计算 content 字符串中"第 N 行第一字符"偏移
- [x] 5.4 加自定义 rehype 插件给 react-markdown 的 block-level 节点挂 `data-md-line-start={node.position.start.line}`（仅 magnitude 1-based 行号）
- [x] 5.5 在 MarkdownPreview.tsx 内 plug 该插件（仅当 `markLines=true`，磁贴上下文传 true）
- [x] 5.6 NotePad 双击进编辑时把 hook 提供的 (x, y) 传给 caretFromPoint，结果用 `tileTextareaRef.current.setSelectionRange(offset, offset)` 应用
- [x] 5.7 新建 `caretFromPoint.test.ts`，覆盖：纯文本中点击第 N 字符、Markdown 行首退化、API 缺席降级到末尾

## 6. 标题栏带 + 折叠态（D6）

- [x] 6.1 `Tile.tsx` 顶部布局调整：增加 32px 标题栏带（`<div data-tile-titlebar="true">`），原 `padding-top: 16` 改为标题栏高 32px
- [x] 6.2 标题字段渲染挪入标题栏带左侧；关闭按钮和 corner mark 保持位置（关闭按钮已在右上 8px 内，无冲突）
- [x] 6.3 正文区外层加 `data-tile-content="true"` 标记，与标题栏带在双击分流上严格区分
- [x] 6.4 `NotePad.tsx` 增加 `tileCollapsed: boolean` 状态；进入磁贴时从 layout.collapsed 初始化（Group 9 接入）
- [x] 6.5 实现 `toggleCollapse` 函数：切换状态 + Window.setSize（折叠 → max(120, measureTitleWidth + ...)、36；展开 → preCollapseSize）
- [x] 6.6 双击事件分流：在 NotePad 接收 hook 的 onDoubleClick(event) 时，检查 event.target.closest('[data-tile-titlebar]') → toggleCollapse；否则 enterEditMode + 光标定位
- [x] 6.7 折叠态 CSS：正文区 display:none；标题栏带保持完整渲染
- [x] 6.8 折叠态写 layout 时跳过 width/height（防止覆盖展开尺寸）— Group 9 接入

## 7. 后端 schema：tile_layout 字段（D5 后端）

- [x] 7.1 `src-tauri/src/services/notes.rs` 新增 `TileLayout` 结构体（x, y: i32, width, height: u32, collapsed: bool with #[serde(default)]）+ Default 派生
- [x] 7.2 `Note` / `NoteMetadata` / `SaveNoteRequest` 各加 `tile_layout: Option<TileLayout>` + `#[serde(default, skip_serializing_if = "Option::is_none")]`
- [x] 7.3 调整 `read_note` / `create_note` / `update_note` / metadata rebuild 路径，透传 / 默认填充 tile_layout
- [x] 7.4 `desktop.rs` 的 `maybe_save_surface_size`：检查 window.label，tile- 开头时短路返回（不写 AppConfig.surface_width/height）
- [x] 7.5 `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- [x] 7.6 现有 cargo 单测的 SaveNoteRequest 构造点用 `..Default::default()` 续写（同 v1 模式）— 实际改成显式补字段

## 8. 前端类型与 API 对齐（D5 前端）

- [x] 8.1 `src/features/notes/types.ts` 加 `TileLayout` 类型 + `NoteMetadata.tileLayout?` / `Note.tileLayout?` / `SaveNoteRequest.tileLayout?`
- [x] 8.2 `src/features/notes/api.ts` 透传 tileLayout（无变化，类型自动联通）
- [x] 8.3 `src/features/notes/noteUtils.ts` 的 `metadataFromNote` 同步透传 tileLayout
- [x] 8.4 新建 `src/features/tile/tileLayout.ts`，实现 `applyTileLayout(layout, monitors, primary)` 越界回退函数（纯函数，便于测试）
- [x] 8.5 新建 `tileLayout.test.ts`，覆盖：在监视器内、单屏越界、多屏布局、availableMonitors 为空降级

## 9. 布局监听器与 setBounds 接入（D5 接通）

- [x] 9.1 `NotePad.tsx` 增加 layout 监听 effect：进入 tile surface 时 attach `getCurrentWindow().onMoved` + `onResized`，500ms debounce 后调 updateNote
- [x] 9.2 effect cleanup 时 unlisten；切回 pad / 卸载时不再写
- [x] 9.3 `switchSurfaceMode("tile")` 时若有 noteTileLayout，先用 resolveLayoutBounds 越界检查后 setBounds；否则用现有 default
- [x] 9.4 进入 tile 时若 layout.collapsed=true，立即 setSize 折叠尺寸，setTileCollapsed(true)
- [x] 9.5 验证：拖动磁贴 → 关掉应用 → 重启 → 磁贴位置 / 尺寸 / 折叠状态恢复（手动测试时验证）

## 10. 编译 & 验证

- [x] 10.1 `npm test` 全绿（含新的 useTileDoubleClick / caretFromPoint / tileLayout 测试）
- [x] 10.2 `npm run lint` 无新增 error
- [x] 10.3 `npm run build` TypeScript 通过
- [x] 10.4 `npm run tauri build` release 编译通过，产物刷新
- [x] 10.5 `openspec validate tile-mode-polish` 通过

## 11. 提交与推送

- [x] 11.1 创建分支 `feat/tile-mode-polish`（基于 `feat/tile-mode-optimizations` 之后的 main）
- [x] 11.2 按 1-7 边界分组 commit（11 步：颜色 / 调色板常量 / palette 组件 / 双击 hook / 光标定位 / 折叠 / 后端 schema / 前端类型 / 监听器 / openspec / 文档）
- [x] 11.3 `git push -u origin feat/tile-mode-polish`
- [x] 11.4 PR 链接返回给用户
