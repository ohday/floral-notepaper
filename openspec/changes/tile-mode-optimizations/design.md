## Context

`floral-notepaper` 的磁贴（Tile）窗口当前由 `src/components/NotePad.tsx` 单组件用 `surfaceMode === "tile"` 分支驱动，渲染到 `src/components/Tile.tsx`。磁贴目前是只读视图：用户切到磁贴后只能拖拽 / 复制 / 关闭，要改内容必须切回 pad，链路冗长。

颜色侧只有 `AppConfig.tile_color` 一个全局值，没有"按笔记记色"的概念。Markdown 渲染（`src/features/markdown/MarkdownPreview.tsx`）对 `<img>` 一刀切 `w-[50%] mx-auto`，文档式排版不适用磁贴的小窗口语义。

后端笔记数据由 `src-tauri/src/services/notes.rs` 的 `Note` / `NoteMetadata` 持有，使用 serde + JSON 文件存储，所有字段都已用 `#[serde(default)]`，新增可选字段成本极低。

## Goals / Non-Goals

**Goals:**

- 让磁贴成为**可编辑**的轻量窗口：双击进、点外面/Esc 出，外观保留
- 让 Markdown 列表 / 引用 / 缩进编辑符合主流编辑器肌肉记忆（按一次回车 = 一次正确补全）
- 让每个笔记记住自己的磁贴颜色，新磁贴默认沿用"最后调过的色"
- 让磁贴里的图片"墙纸式"铺满，把磁贴当作可视化纪念品来用
- 让标题颜色实际看得清

**Non-Goals:**

- 不引入富文本 / WYSIWYG 编辑器（磁贴编辑仍是 textarea）
- 不做颜色主题预设（用户用现有调色板）
- 不做协同 / 历史记录 / 版本快照
- 不动 i18n 文案体系、全局快捷键、托盘菜单、设置面板大结构
- 不重写 `tile_color` 配置语义之外的任何后端逻辑

## Decisions

### D1：磁贴双击编辑用"局部状态"，不切 surface

**选择**：在磁贴只读 `<Tile>` 里再加一层 `tileEditing: boolean` 状态。`true` 时把内容区从只读 div 换成 textarea，外壳（color / corner marks / close 按钮 / resize handles）原样保留。窗口仍是 `surfaceMode === "tile"`。

**为什么不切回 pad**：切 surface 会触发动画 + always-on-top 改写 + 边界变化，体感是"换了个窗口"，违背"就地编辑"语义。局部状态保持视觉连续性。

**进入**：在磁贴内容区监听 `onDoubleClick`（不在关闭按钮、resize 句柄上）。

**退出**：`pointerdown` 监听 document，目标不在磁贴 root 内即退出；同时 textarea `onKeyDown` 监听 Esc。退出时不主动 save，复用现有 `noteSurfaceAutoSave` 的 900ms 防抖路径——`status="dirty"` 已经会触发它。

**多磁贴并发**：状态局部，多个磁贴可同时编辑，各管各的。

### D2：Markdown 自动补全抽 hook，编辑器和磁贴共用

**选择**：新建 `src/features/markdown/useMarkdownAutoComplete.ts`，导出 `handleEnterKey(event, { value, setValue })`。pad 里的 textarea 和磁贴编辑 textarea 都在 `onKeyDown` 里调用。

**hook 内部状态机**：

```
当前行 (currentLine) 抽取             →  动作
─────────────────────────────────────────────────────────
^(\s*)- \[[ x]\] (.*)$  非空内容       →  插入 "\n${indent}- [ ] "
^(\s*)- \[[ x]\] $       空内容        →  整行替换为 "${indent}"（退出）
^(\s*)(\d+)\. (.+)$      非空内容      →  插入 "\n${indent}${n+1}. "
^(\s*)(\d+)\. $          空内容        →  整行替换为 "${indent}"（退出）
^(\s*)- (.+)$            非空内容      →  插入 "\n${indent}- "
^(\s*)- $                空内容        →  整行替换为 "${indent}"（退出）
^(\s*)> (.*)$            非空内容      →  插入 "\n${indent}> "
^(\s*)> $                空内容        →  整行替换为 "${indent}"（退出）
^(\s+)(.+)$              非空内容      →  插入 "\n${indent}"
其它                                   →  默认行为（不 preventDefault）
```

注意 task list 检测必须在普通 `-` 之前，序号 `1.` 在缩进之前。

**为什么不做代码块自动闭合**：粘贴含有未闭合 ``` 的代码块时会重复闭合，是常见 Bug；先排除。

**有序列表重新编号**：仅用"上一行序号 +1"，不做 list block 整体重排。简单、可预期、足够日常。

### D3：标题颜色公式调整

`Tile.tsx` 的 useMemo 配色公式：

| 字段         | 现状                  | 改为                   |
| ------------ | --------------------- | ---------------------- |
| `titleColor` | `mix(0.4).alpha(0.5)` | `mix(0.6).alpha(0.85)` |

`isLightBg` 阈值 `luminance > 0.18` 在饱和深色（如 `#2a4a8c`，luminance ≈ 0.06）下走 dark 分支、混向白色，正确。在饱和浅色（如 `#f6f3ec`，luminance ≈ 0.88）走 light 分支、混向黑，正确。**保持 0.18 不动**。

其他字段（border / corner / content / empty）暂不调，避免连锁视觉变化超出 scope。

### D4：颜色挂笔记（4a），`AppConfig.tile_color` 语义复用

**选择**：

- `NoteMetadata` 和 `Note` 在 Rust 端新增 `tile_color: Option<String>`（`#[serde(default)]`）
- `SaveNoteRequest` 同步加可选字段
- `AppConfig.tile_color` **不重命名**，但语义从"全局磁贴色"调整为"最后被调过的色 / 没有自定义色时的回退"。两个角色合并到一个字段
- 前端新增 `resolveNoteTileColor(note, config)`：`note.tile_color ?? resolveTileColor(config.tile_color_mode, config.tile_color)`
- 调色入口：用现有右键菜单（`tileContextMenu.ts` 已存在）追加"调整颜色…"项，弹一个轻量调色板（用浏览器原生 `<input type="color">`，避免新增依赖）
- 改色后写两处：① `updateNote` 带上新 `tile_color` ② `setConfig` 把 `tile_color` 也更新（即"最后调过的色"）
- 设置面板里现有的"磁贴颜色"控件含义不变（用户能感受到它就是 last-color），无 UI 变更

**为什么不另开 `last_tile_color`**：用户实测的心智是"我刚改的色就是默认色"，单字段足够；新增字段需要两处保持同步，更脆弱。

**回退顺序**（前端）：

```
note.tileColor (per-note)
  → config.tileColorMode === "system" ? systemColor : config.tileColor
  → DEFAULT_TILE_COLOR
```

**迁移**：旧 `.notes-meta.json` 没有 `tileColor` → 反序列化 `None` → 走回退到 config，零改动。

### D5：图片渲染改 CSS scope，不传 prop

**选择**：磁贴的 `<MarkdownPreview>` 外层 div 加 `className="tile-md"`；在全局 CSS 里加：

```css
.tile-md img {
  width: calc(100% + 2rem); /* 抵消父级 px-4 = 1rem 左右 */
  margin-left: -1rem;
  margin-right: -1rem;
  border-radius: 0; /* 边到边时圆角不好看 */
  display: block;
}
```

**为什么不传 prop**：CSS scope 的好处是后续如果想让磁贴里的标题、列表也更紧凑，可以在同一个 `.tile-md` 下叠加规则，不需要改组件接口。

**只在磁贴外壳加**：`Tile.tsx` 里 `MarkdownPreview` 的包裹 div 加这个 class；编辑器路径（`MarkdownPreviewWindow` 之类）不加，原 `w-[50%] mx-auto` 默认行为保持。

### D6：调色入口的 UX

**选择**：右键菜单 → "调整颜色…" → 触发 `<input type="color">`（隐藏，编程式 click） → onChange 时 ① 立刻视觉反馈 ② debounce 300ms 后写后端。

**为什么不做磁贴上小色板按钮**：

- 磁贴空间已经紧凑（260×260），多一个按钮影响纯净度
- 右键菜单是已有交互，发现成本低（用户右键磁贴是常见动作）
- 原生 color picker 跨平台、零依赖、无需自己画 UI

## Risks / Trade-offs

| 风险                                                | 影响                               | 缓解                                                                              |
| --------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| 双击进入编辑可能与系统级"双击拖拽全屏"冲突          | 用户在标题栏拖拽时误触             | 双击监听挂在内容区 div，不挂在拖拽区域；handleDrag 已经过滤 button/input/textarea |
| `tile_color` 字段语义变化（从"全局"到"最后调过"）   | 用户在设置面板设的色被"无意中"覆盖 | 设置面板的控件依然存在，用户可继续手动设；新语义是"上次设的色"，符合自然心智      |
| 自动补全干扰 IME 输入（中文候选词回车）             | 中文用户体验下降                   | `event.isComposing === true` 时不触发自动补全，让浏览器原生处理                   |
| 磁贴里图片边到边在窄磁贴（260px）可能太挤           | 视觉违和                           | 这是已知期望行为（用户主动要"铺满"），不做兜底                                    |
| Esc 退出编辑可能与磁贴关闭快捷键冲突                | 误关                               | 当前没有"Esc 关磁贴"快捷键，无冲突；Esc 仅在 textarea focus 时触发                |
| 序号自动递增对 "1. a / 5. b" 这种乱序输入会强制重排 | 与作者意图相反                     | 仅用"上一行 +1"策略，作者打 5 还是会变 6——但作者主动打非顺序号本来就少见，可接受  |

## Migration Plan

1. **后端**：`Note` / `NoteMetadata` 新增 `tile_color: Option<String>` + `#[serde(default)]`，旧 JSON 文件无需迁移
2. **前端**：先合并 hook + CSS scope（D2、D5），再合并标题颜色（D3）、双击编辑（D1）、最后接入颜色持久化（D4、D6）
3. **回滚**：每项独立 commit，必要时 revert 单项；后端字段保留即使前端回滚也无害

## Open Questions

无。所有技术决策在 explore 阶段已锁定。
