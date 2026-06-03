## ADDED Requirements

### Requirement: 磁贴鼠标交互层（拖拽 vs 单击 vs 双击）

磁贴的鼠标交互 SHALL 由 `useTileDoubleClick` hook 统一管理，根据 mousedown 后的鼠标行为区分三种意图：拖拽窗口、单击（保留供未来使用）、双击（触发回调）。该 hook MUST NOT 依赖浏览器原生 `onDoubleClick` 事件，以避开 Tauri `startDragging` 提前接管鼠标后浏览器收不到第二次 mousedown 的问题。

#### Scenario: 鼠标按下后小幅移动 < 5px → 视为点击意图，不启动拖拽

- **WHEN** 用户在磁贴某个区域 mousedown，随后 mousemove 累计位移（|dx| + |dy|）始终 ≤ 5px，最终 mouseup
- **THEN** hook MUST NOT 调用 `startCurrentWindowDrag`；mouseup 后 hook 标记本次序列为"未拖拽"

#### Scenario: 鼠标按下后移动 > 5px → 启动拖拽

- **WHEN** 用户 mousedown 后 mousemove 累计位移 > 5px
- **THEN** hook 立刻调用 `startCurrentWindowDrag()` 一次，并标记 hasDragged=true；本次序列后续不再重复触发

#### Scenario: 两次未拖拽的 mousedown→mouseup 间隔 < 400ms → 双击

- **WHEN** 第一次 mousedown→mouseup（未拖拽）后 < 400ms 内发生第二次 mousedown→mouseup（也未拖拽）
- **THEN** hook 调用 `onDoubleClick(event)`，回调参数携带触发位置 (clientX, clientY) 和原始 target
- **AND** 内部时间戳重置（避免三次连点被识别为两次双击）

#### Scenario: 两次点击间隔 ≥ 400ms

- **WHEN** 第二次 mousedown→mouseup 与上次间隔 ≥ 400ms
- **THEN** 不触发双击；本次记为新的"上一次点击时间"

#### Scenario: 中间有过拖拽序列

- **WHEN** 第一次序列发生过拖拽（hasDragged=true）
- **THEN** 该序列不计入"上一次点击时间"，下一次双击判定从 0 开始计时

### Requirement: 双击进编辑时光标按位置定位

双击磁贴正文区进入编辑模式时，textarea 的 `selectionStart` 和 `selectionEnd` SHALL 设到与双击点击位置对应的字符偏移。

#### Scenario: 纯文本磁贴双击精确定位

- **WHEN** 磁贴渲染模式为 `renderMarkdown=false`，用户双击正文区某个字符
- **THEN** 系统调用 `caretPositionFromPoint(x, y)`（或 `caretRangeFromPoint` 兜底），把得到的 Range 起点映射到 content 字符串的字符偏移
- **AND** textarea 聚焦后 `selectionStart === selectionEnd === 该偏移`

#### Scenario: Markdown 磁贴双击定位到行首

- **WHEN** 磁贴渲染模式为 `renderMarkdown=true`，用户双击渲染后元素
- **THEN** 系统找到目标元素最近的 `[data-md-line-start]` 祖先，读其 `data-md-line-start` 数值（1-based 源码行号）
- **AND** 把光标设到 content 字符串中"第 N 行的第一个字符"对应的偏移
- **AND** 若找不到 `data-md-line-start`（边界情况），退化为光标在内容末尾

#### Scenario: caretPositionFromPoint API 不可用时降级

- **WHEN** webview 既不支持 `caretPositionFromPoint` 也不支持 `caretRangeFromPoint`
- **THEN** 系统退化为光标在内容末尾（保留 v1 行为），不抛异常

### Requirement: 磁贴顶部 32px 标题栏带

磁贴 SHALL 在视觉顶部预留 32px 高的"标题栏带"区域，用于承担窗口拖拽、双击折叠 / 展开、标题文字渲染、关闭按钮容纳。该带区与下方正文区在双击行为上严格分流。

#### Scenario: 标题栏带元素携带语义属性

- **WHEN** 磁贴渲染
- **THEN** 标题栏带元素 SHALL 在 DOM 上有 `data-tile-titlebar="true"` 属性

#### Scenario: 双击落在标题栏带 → 折叠 / 展开

- **WHEN** 双击事件的 target.closest('[data-tile-titlebar="true"]') 命中
- **THEN** 系统调用 `toggleCollapse()`，不进入编辑模式

#### Scenario: 双击落在正文区 → 进编辑

- **WHEN** 双击事件的 target.closest('[data-tile-titlebar="true"]') 不命中，且 target 在 `[data-tile-content="true"]` 内
- **THEN** 系统进入编辑模式，按"双击位置定位光标"逻辑设光标

#### Scenario: 标题栏带在折叠状态下仍可双击

- **WHEN** 磁贴处于折叠状态（窗口高 32px），用户双击标题栏带
- **THEN** 系统调用 `toggleCollapse()` 展开磁贴

### Requirement: 磁贴折叠模式

磁贴 SHALL 支持"完整 ⇄ 折叠（仅标题栏）"两个布局态。折叠时窗口实际尺寸通过 Tauri `Window.setSize` 改变到 32px 高 + 紧凑宽度，正文区 `display:none`。

#### Scenario: 双击标题栏触发折叠

- **WHEN** 磁贴当前是完整状态（collapsed=false），用户双击标题栏带
- **THEN** 系统记下当前 width/height（已经在 layout 里），设 collapsed=true
- **AND** 调用 `Window.setSize({ width: max(120, 标题占用宽度), height: 32 })`
- **AND** 正文区 DOM `display:none`

#### Scenario: 双击标题栏触发展开

- **WHEN** 磁贴当前折叠（collapsed=true），用户双击标题栏带
- **THEN** 系统设 collapsed=false
- **AND** 调用 `Window.setSize` 回到 layout.width / layout.height
- **AND** 正文区 DOM 恢复显示

#### Scenario: 折叠态的最小宽度

- **WHEN** 磁贴折叠
- **THEN** 窗口宽度 SHALL ≥ 120px，且不超过现行 Tile 容器内的"标题占用宽度 + 关闭按钮 + 16px padding"

#### Scenario: 折叠期间不写入 layout 的 width/height

- **WHEN** 磁贴折叠，用户拖动 / 系统触发 onResized 事件
- **THEN** debounced layout writer SHALL 跳过 width/height 字段更新（仅更新 x/y），避免折叠态尺寸覆盖展开尺寸

### Requirement: 磁贴标题颜色公式深于正文

磁贴标题颜色 SHALL 使用 `chroma.mix(tileColor, mixTarget, 0.78).alpha(0.95)` 公式（mix 比例 0.78、alpha 0.95），相比正文 `mix 0.65 alpha 0.85` 显著加深，符合 H1/H2 typography 惯例。`isLightBg` 阈值（`luminance > 0.18`）保持不变。

#### Scenario: 标题在 8 个预设色上均可读

- **WHEN** 磁贴背景色取自 `TILE_PRESET_COLORS` 任一值（FCF9EA / BADFDB / FFA4A4 / FFBDBD / DDE6ED / 9DB2BF / 526D82 / 27374D），且磁贴有标题
- **THEN** 标题颜色经公式计算后与背景的对比度足够清晰可读（人工验证 + 测试该公式输出非透明）

#### Scenario: 标题深度超过正文

- **WHEN** 同一背景色下计算 titleColor 与 contentColor
- **THEN** titleColor 的 lightness（在亮背景上）SHALL 严格小于 contentColor 的 lightness（视觉上更深）

### Requirement: 固定调色板 popover

磁贴右键菜单 → "调整颜色…" SHALL 弹出一个非模态 popover，呈现 8 个固定预设色 + "自定义颜色…"入口。Popover 锚定在右键事件触发位置，关闭条件包括点外部、Esc、选中色卡。

#### Scenario: 8 个色卡按 2×4 网格排列

- **WHEN** popover 打开
- **THEN** 渲染网格如下：
  - 第一行（浅色）：FCF9EA / BADFDB / FFBDBD / DDE6ED
  - 第二行（深色）：FFA4A4 / 9DB2BF / 526D82 / 27374D
- **AND** 每张色卡为约 36×36 圆角方块，圆角 8px

#### Scenario: 当前选中色卡的视觉标记

- **WHEN** popover 打开，当前 effectiveTileColor 与某张色卡的 hex（不区分大小写）相等
- **THEN** 该色卡 SHALL 有 2px 描边 + 中央 ✓ 标记，✓ 颜色用与该色卡一致的标题色公式（保证对比可读）

#### Scenario: 点击色卡立即应用并关闭 popover

- **WHEN** 用户点击某张色卡
- **THEN** 系统调 `onChange(hex)`（触发 v1 已有的 `setNoteTileColor` + 防抖持久化）
- **AND** popover 立即关闭（`onClose()`）

#### Scenario: 点击"自定义颜色…"打开原生 picker

- **WHEN** 用户点击"自定义颜色…"项
- **THEN** popover 关闭，触发隐藏的 `<input type="color">`，恢复 v1 调色路径作为兜底

#### Scenario: 点 popover 外部 / 按 Esc 关闭

- **WHEN** popover 打开，用户在 popover 外按下指针，或按下 Esc
- **THEN** popover 关闭，颜色不变

### Requirement: 磁贴颜色预设常量

代码中 SHALL 维护 `TILE_PRESET_COLORS: ReadonlyArray<{ hex: string; nameKey: string }>` 常量，hex 字段为小写 6 位 hex（不带 #）；nameKey 为 i18n 键，三个 locale 同步翻译色名。

#### Scenario: 8 个预设色的 hex 与 i18n key

- **WHEN** 读取 `TILE_PRESET_COLORS`
- **THEN** 数组长度为 8，hex 集合恰好为 `{ "fcf9ea", "badfdb", "ffa4a4", "ffbdbd", "dde6ed", "9db2bf", "526d82", "27374d" }`
- **AND** 每条带一个 `nameKey`（如 `tile.palette.preset.fcf9ea`），三个 locale 资源均有该键
