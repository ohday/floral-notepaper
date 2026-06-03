## Context

`tile-mode-optimizations` 上线后五个回归 / 体验问题集中曝出，且互相耦合最关键的是问题 1（双击失效）—— Tauri 的 `startDragging()` 一旦被调，OS 立即接管鼠标事件，第二次 mousedown 不会到达浏览器，`onDoubleClick` 永远不触发。这个问题会传染到问题 5（折叠也是双击触发）。

颜色侧：上一轮把颜色挂到了笔记上但留了原生 color picker；用户实测觉得"挑色太麻烦"。
布局侧：颜色 per-note 但**位置和尺寸还是全局**（`AppConfig.surface_width/height` 一份），违反"一便签一格"。

后端的 NoteMetadata schema 在上一轮已经加过 `tile_color`，再加 `tile_layout` 是平行扩展；前端 hooks 化 + 受控组件化是上一轮就铺好的方向。

## Goals / Non-Goals

**Goals:**

- 让双击进编辑**真的能工作**，且光标停在用户点的字符上
- 让标题在视觉上**比正文略重**（H1/H2 的 typography 惯例）
- 让调色"3 秒搞定"——8 个固定色一眼能挑
- 让每个笔记记住自己磁贴的位置和尺寸，重启后原样回到桌面
- 加一个 macOS Stickies 风格的折叠形态，桌面能塞更多便签

**Non-Goals:**

- 不引入富文本 / WYSIWYG 编辑器（textarea 路线不变）
- 不做颜色主题预设系统（仅 8 个固定色 + 自定义兜底）
- 不做磁贴间分组 / 链接 / 标签
- 不为 Markdown 磁贴做"双击精确定位到源码字符"（行业难题，行首退化够用）
- 不重写磁贴外观（边框、四角、阴影、字体一律不动）
- 不改 i18n 文案体系，仅加最少的两条调色板相关 key

## Decisions

### D1：双击交互重写——「移动阈值 + 时间戳判定」

**问题根因**：

```
现状（坏）：
mousedown → handleDrag → startCurrentWindowDrag()
                              ↓
                        OS 接管鼠标，浏览器看不到第二次 mousedown
                              ↓
                        dblclick 永远不触发 ✗
```

**新方案（好）**：

```
mousedown
  ├─ 记录 (startX, startY, startTime)
  ├─ 不立即 startDragging
  └─ 监听后续 mousemove
       ├─ |dx| + |dy| > 5px → 此时才 startDragging，标记 hasDragged=true
       └─ 否则继续等

mouseup
  ├─ hasDragged?
  │   ├─ true → 这次是拖拽，结束（OS 已经处理）
  │   └─ false → 这次是 click
  │              ├─ now - lastClickTime < 400ms → 双击触发
  │              └─ else → 记录 lastClickTime = now
```

**为什么 5px 阈值**：人眼觉察不到 5px 抖动，但能稳定区分"故意按住拖"和"轻点"。Windows 系统的 `SM_CXDRAG` 默认就是 5（虽然个体差异，但 5 是经验值）。

**为什么 400ms**：Windows `GetDoubleClickTime` 默认 500ms，浏览器 dblclick 也用 500ms；选 400ms 略保守，减少误触发（用户连续单击两次不希望被识别为双击）。

**实现位置**：抽 `useTileDoubleClick({ rootRef, onDoubleClick })` hook，返回 `{ onMouseDown }` 单一 prop。`onMouseDown` 内部全部 wire 好 mousemove / mouseup（attach 到 window，确保不漏事件）。

**为什么不在 mouseup 后才 startDragging**：因为 mouseup 后 OS 不知道该拖了，用户体感是"按住没反应"。所以阈值方案——5px 内点击响应，5px 外才进入拖拽。

**Alternatives considered**：

- 用 `pointerdown` + `pointercancel`：Tauri 当前的 webview 对 pointercancel 行为不一致，跨 macOS/Windows 不可靠
- 改 Tauri 后端不立即接管：要 patch Tauri 源码或绕道 IPC，远超本 change scope

### D2：光标定位——纯文本走 caretPositionFromPoint，Markdown 退化到行首

**纯文本路径**：

```
1. 双击事件携带原始 (clientX, clientY)
2. 在显示态 div（renderMarkdown=false 的纯文本渲染区）调用：
     document.caretPositionFromPoint(x, y)   // Firefox / Safari 18+ / Chrome 128+
     或 document.caretRangeFromPoint(x, y)   // Chrome 早期版本
3. 拿到 Range，遍历父链找到 [data-tile-text-root]
4. 用 TreeWalker 遍历 textNode，累加 text.length 直到 hit Range.startContainer，加上 startOffset
5. 设到 textarea.selectionStart / selectionEnd
```

**Markdown 路径（退化）**：

```
1. 找到 click target 最近的 [data-md-line-start] 祖先
2. react-markdown 默认不挂这个 attribute，但 remarkGfm AST 里每个节点的
   .position.start.line 是原始行号
3. 写一个 rehype 自定义插件，给每个 block-level 节点（p / li / blockquote）
   挂 data-md-line-start={position.start.line}
4. 双击时读这个属性，定位到 content 字符串的"第 N 行行首"
   const lineStart = content.split("\n", n).join("\n").length + (n > 0 ? 1 : 0)
5. 设到 textarea.selectionStart
```

**为什么 Markdown 不做精确定位**：从渲染的 `<strong>` 内的"加粗"两个字反推到源码 `**加粗**` 的字符偏移是非平凡 AST 反演，需要在每个 inline 节点都挂偏移信息——工程量大、维护风险高。行首足够实用。

**Webview 兼容性**：

- Tauri 2 在 Windows 用 WebView2（Edge），`caretPositionFromPoint` 从 Edge 124+ 起可用；之前用 `caretRangeFromPoint`
- macOS WKWebView 长期支持 `caretRangeFromPoint`
- 实现时同时尝试两个 API，取先返回非空者

### D3：标题颜色加深至 mix 0.78 alpha 0.95

```
当前：mix(0.6) alpha(0.85)   ← 比正文 mix(0.65) 还浅
正文：mix(0.65) alpha(0.85)
新值：mix(0.78) alpha(0.95)  ← 比正文显著重，符合 H1/H2 惯例
```

**alpha 从 0.85 提到 0.95** 是因为 0.85 在亮背景下会看到一点透色感；0.95 几乎实色，但仍保留一点点"墨"的呼吸感。

**8 个新预设色都验证一遍**：

| Hex    | luminance | isLightBg | 标题色（mix 0.78 alpha 0.95 toward dark/white） |
| ------ | --------- | --------- | ----------------------------------------------- |
| FCF9EA | 0.95      | T (light) | 偏暖深棕                                        |
| BADFDB | 0.71      | T         | 深青                                            |
| FFA4A4 | 0.51      | T         | 深红                                            |
| FFBDBD | 0.62      | T         | 深红                                            |
| DDE6ED | 0.79      | T         | 深灰                                            |
| 9DB2BF | 0.43      | T         | 接近黑（边界）                                  |
| 526D82 | 0.16      | F (dark)  | 接近白                                          |
| 27374D | 0.04      | F         | 白                                              |

`9DB2BF` 在 luminance 0.43 处仍判 light，标题混向 #1a1a18 → 接近黑，可读。OK。

### D4：固定调色板 popover

**为什么不用 modal**：磁贴本身才 260×260，全屏 modal 视觉打断感太强。Popover 锚在磁贴右键的鼠标位置，关掉自然。

**网格布局**：

```
┌──── 选择磁贴颜色 ────────┐
│                            │
│  ⬜ 🟢 🟥 🟥                │   ← 浅色行（FCF9EA / BADFDB / FFBDBD / DDE6ED）
│  奶白 薄荷 浅珊瑚 云灰     │
│                            │
│  🟥 🔘 🔵 ⚫                │   ← 深色行（FFA4A4 / 9DB2BF / 526D82 / 27374D）
│  深珊瑚 钢灰 靛蓝 深海蓝   │
│                            │
│  ──────────────            │
│  🎨 自定义颜色…            │
└────────────────────────────┘
```

色卡尺寸 36×36 圆角 8px，hover 时 scale 1.08 + box-shadow 加重；当前选中色卡有 2px 实色描边 + 中央 ✓ 标记（用磁贴的标题色公式算 ✓ 的颜色，确保对比可读）。

**Popover 关闭逻辑**：

- 点 popover 外 → 关
- Esc → 关
- 选中某色 → 立即应用 + 关
- "自定义颜色…" → 触发隐藏的 `<input type="color">`，关 popover

**实现**：受控组件 `<TileColorPalette open anchorX anchorY value onChange onClose>`。NotePad 持有 `paletteState: { open: boolean; x: number; y: number }`。

**i18n**：

```
tile.palette.title    "选择磁贴颜色"  /  "選擇磁貼顏色"  /  "Pick Tile Color"
tile.palette.custom   "自定义颜色…"   /  "自訂顏色…"    /  "Custom Color…"
```

色卡名字（"奶白" 等）用 hex 做 key 记到 `TILE_PRESET_COLORS` 里，每条带 i18n 键，避免硬编码中文（en-US 用色名英文）。

### D5：磁贴布局持久化（位置 + 尺寸 + 折叠）

**Schema**（Rust）：

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TileLayout {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub collapsed: bool,
}

// NoteMetadata / Note / SaveNoteRequest
#[serde(default, skip_serializing_if = "Option::is_none")]
pub tile_layout: Option<TileLayout>,
```

**写时机（前端）**：

```
进入 tile surface 后 attach 监听：
  await window.onMoved((event) => debouncedSave(event.payload))
  await window.onResized((event) => debouncedSave(event.payload))

debouncedSave 500ms 防抖：
  - 取最新 size + position
  - 调 updateNote(noteId, { ..., tileLayout: { x, y, w, h, collapsed } })
  - collapsed 用当前内存里的状态，不从 layout 读
```

**读时机**：

- `applyNote(note)` 时：`setNoteTileLayout(note.tileLayout ?? null)`
- `switchSurfaceMode("tile")` 时：若 `noteTileLayout` 非空 → apply，否则用 `getSurfaceTargetBounds("tile", currentBounds)` 默认值

**多屏越界回退**：

```javascript
async function applyTileLayout(layout) {
  const monitors = await availableMonitors();
  const inAnyMonitor = monitors.some(
    (m) =>
      layout.x + 50 >= m.position.x && // 至少 50px 在监视器内
      layout.x + 50 < m.position.x + m.size.width &&
      layout.y >= m.position.y &&
      layout.y < m.position.y + m.size.height,
  );
  if (inAnyMonitor) {
    await setBounds(layout);
  } else {
    // 落屏外 → 主屏右下角 + layout.size
    const primary = await primaryMonitor();
    await setBounds({
      x: primary.position.x + primary.size.width - layout.width - 20,
      y: primary.position.y + primary.size.height - layout.height - 20,
      width: layout.width,
      height: layout.height,
    });
  }
}
```

**`AppConfig.surface_width/height` 语义调整**：

```
旧语义：所有磁贴 / pad 共享尺寸
新语义：默认尺寸（首次开 pad、或 note 没有 tile_layout 时回退）

写入：
  - pad 模式 resize → 仍写 surface_width/height（保留旧行为）
  - tile 模式 resize → 不写全局；写 note.tile_layout

desktop.rs 现行的 maybe_save_surface_size 加一个判断：
  if window.label.starts_with("tile-") { return; }
```

### D6：折叠模式

**标题栏带定义**：

```
Tile.tsx 内部布局调整：

  ┌───────── 顶部 32px 标题栏带 ─────────┐
  │ ▍标题文字（如有）              ✕    │   ← onDoubleClick = collapse toggle
  ├───────────────────────────────────────┤   ← (折叠时此线以下都 display:none)
  │                                       │
  │  正文区                               │   ← onDoubleClick = enter edit
  │                                       │
  └───────────────────────────────────────┘

CSS 区域语义（双击行为分流）：
  [data-tile-titlebar="true"]  → 折叠/展开
  [data-tile-content="true"]   → 进编辑
```

**折叠状态的窗口尺寸**：

```
collapsed width = max(120, 标题文字宽度 + 关闭按钮宽 + padding)
collapsed height = 32

测量标题宽度的方式：
  - 用一个隐藏的 <span ref> 渲染标题文字，measure offsetWidth
  - 或：固定一个宽度上限（例如 240），让 CSS text-overflow: ellipsis 截断

  选第二个：避免动态测量带来的渲染抖动
```

**展开时的尺寸**：

折叠时 layout 已记着展开尺寸（write-on-resize 流程在折叠**之前**已经存好了）。展开就是 setSize 回 layout.width / height。

**为什么 collapsed 字段存 layout 里**：collapsed 状态本身需要持久化（重启时恢复折叠），逻辑上是布局的一部分。如果把 collapsed 单独抽出来反而要多一处同步。

**双击分流（关键）**：

```
useTileDoubleClick 在 onDoubleClick 回调里 dispatch (clientX, clientY)；
NotePad 接收回调时根据 target.closest('[data-tile-titlebar]') 决定：
  - 命中标题栏 → toggleCollapse()
  - 否则 → enterEditMode(x, y)
```

这个 if-else 写在 NotePad 而非 hook 里，保持 hook 的通用性（hook 只判定"是否为双击"，不判定"双击该做什么"）。

## Risks / Trade-offs

| 风险                                                                          | 影响                                            | 缓解                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 5px 阈值在高 DPI 屏幕（>1.5x scale）显得短                                    | 用户轻拖也会立即进入 drag                       | 用 logical pixels（已经是了，因为 React mouseEvent 用 CSS px）；按需调到 8px                                    |
| 自定义双击 400ms 比系统快                                                     | 用户期待的双击有时不识别                        | 实测调；最差的用户体验是要再点一次，不会误关窗口                                                                |
| Markdown 行首退化光标                                                         | 用户期待"双击哪改哪"                            | 在改进的回归测试 / 反馈循环里看；如果用户接受度低，下一轮再上 source-offset 全量映射                            |
| `caretPositionFromPoint` 在 Edge < 124 不可用                                 | 部分老 webview 走不到精确定位                   | 用 caretRangeFromPoint 兜底；如果都不行，退化为内容末尾（保留现行行为）                                         |
| 多屏回退算法对"屏幕只覆盖部分坐标"的边界情况                                  | 磁贴跑到屏幕缝隙                                | 用 50px 内边界；测试多屏配置                                                                                    |
| `NoteMetadata.tile_layout` 写入频率（500ms debounce）在用户连续拖动时仍可能高 | 大量 fs.write_atomic                            | 现有 metadata 文件总大小 < 几 KB，500ms 一次写入完全负担得起                                                    |
| 折叠时窗口实际 resize 通过 Tauri Window.setSize 触发 onResized 事件           | 形成自循环（resized → write layout → 重新读取） | onResized handler 检查 `if (collapsed) return`（折叠期间不写 size），或让 layout 中的 size 字段只在非折叠态更新 |
| 8 色卡的中文名 i18n                                                           | locale 文件膨胀                                 | 每个色卡 3 个 locale × 8 个 = 24 条；可接受                                                                     |

## Migration Plan

1. **后端**：`Note` / `NoteMetadata` / `SaveNoteRequest` 增加 `tile_layout: Option<TileLayout>` + `#[serde(default, skip_serializing_if = "Option::is_none")]`，旧 JSON 无须迁移
2. **前端**（独立可回滚）：
   - Step 1（D3 标题色）：1 个数字改动，先发，可在 5 分钟内 revert
   - Step 2（D4 调色板）：新组件 + popover 状态，独立 commit
   - Step 3（D1+D2 双击交互重写）：抽 hook、替换 handleDrag、加光标定位
   - Step 4（D6 折叠）：依赖 D1 的双击 hook
   - Step 5（D5 持久化）：所有功能都已就绪后接最后一步，避免持久化错乱状态
3. **回滚策略**：每步独立 commit；后端字段保留即使前端回滚也无害（旧前端忽略未知字段）

## Open Questions

无。explore 阶段所有决策已锁定：

- 双击实现 mousedown 5px 阈值 + 400ms 间隔 ✓
- Markdown 光标退化为行首 ✓
- 标题色 typography 惯例（深于正文）✓
- 8 色卡用统一公式推标题色 ✓
- 标题栏带 = 顶部固定 32px ✓
- 持久化 debounce 500ms ✓
