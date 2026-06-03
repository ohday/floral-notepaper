## ADDED Requirements

### Requirement: 磁贴双击进入就地编辑

磁贴窗口 SHALL 支持在不切换 surfaceMode 的前提下进入和退出编辑模式。进入：用户在磁贴内容区双击。退出：在磁贴外按下指针、或 textarea 聚焦时按下 Esc。编辑模式下 MUST 保留磁贴的颜色、四角标记、关闭按钮、resize 句柄、窗口位置和尺寸。

#### Scenario: 在磁贴内容区双击进入编辑

- **WHEN** 用户在磁贴内容区（不在关闭按钮、resize 句柄、拖拽热区上）双击
- **THEN** 磁贴的内容区由只读 div 切换为 textarea，textarea 自动获得焦点，初始值等于当前 note.content

#### Scenario: 点磁贴外部退出编辑

- **WHEN** 编辑模式下，用户在文档上按下指针，且 pointerdown 目标不在磁贴 root 元素内
- **THEN** 磁贴退出编辑模式，回到只读视图，已修改但未保存的内容由现有 noteSurfaceAutoSave 路径继续按 900ms 防抖保存

#### Scenario: textarea 聚焦时按 Esc 退出

- **WHEN** 编辑模式下 textarea 聚焦，用户按下 Esc 键
- **THEN** 磁贴退出编辑模式，回到只读视图

#### Scenario: 编辑模式保留外观

- **WHEN** 磁贴处于编辑模式
- **THEN** 磁贴背景色、边框、四角标记、关闭按钮 SHALL 保持与只读模式相同；窗口位置、尺寸、always-on-top 状态不变

#### Scenario: 多磁贴并发编辑

- **WHEN** 多个磁贴窗口同时存在，用户先双击磁贴 A 再双击磁贴 B
- **THEN** A 和 B 同时处于编辑模式，互不影响

#### Scenario: 不阻断已有交互

- **WHEN** 编辑模式下用户点击关闭按钮
- **THEN** 磁贴正常关闭；resize 句柄、拖拽热区行为也保持原样

### Requirement: 磁贴颜色调整入口

磁贴 SHALL 提供右键菜单项 "调整颜色…"，点击后弹出原生颜色选择器。颜色变化 MUST 立刻在视觉上反馈，并在 300ms 防抖后持久化到笔记元数据和应用配置。

#### Scenario: 通过右键菜单打开颜色选择器

- **WHEN** 用户在磁贴上右键，选择 "调整颜色…"
- **THEN** 系统触发原生 `<input type="color">`（编程式打开），初值为当前磁贴颜色

#### Scenario: 颜色变化的视觉反馈

- **WHEN** 用户在颜色选择器中拖动 / 改变值
- **THEN** 磁贴当前的渲染颜色 SHALL 立即反映新值，不等待持久化

#### Scenario: 颜色变化的持久化

- **WHEN** 用户停止改变颜色 300ms 后
- **THEN** 系统 SHALL ① 用 updateNote 把新 tileColor 写入该笔记的 NoteMetadata，② 用 setConfig 把同一个值写入 AppConfig.tile_color

### Requirement: 磁贴里 Markdown 图片边到边铺满

当 Markdown 在磁贴上下文（外壳带 `tile-md` class）渲染时，所有 `<img>` 元素 SHALL 横向占满磁贴内容宽度，并抵消父级 1rem 内边距以达成"边到边"视觉。其他渲染上下文（编辑器、笔记预览窗口）保持原有 `w-[50%] mx-auto` 行为不变。

#### Scenario: 磁贴里渲染图片

- **WHEN** Markdown 内容包含 `<img>`，且其外壳带 `tile-md` class
- **THEN** 图片 width SHALL 为 `calc(100% + 2rem)`，左右 margin 为 `-1rem`，display 为 block，边到边铺满磁贴

#### Scenario: 编辑器渲染图片不变

- **WHEN** Markdown 内容在 NoteEditor 或其他不带 `tile-md` class 的容器中渲染
- **THEN** 图片样式保持 `w-[50%] mx-auto block` 不变

### Requirement: 磁贴标题颜色加深

磁贴标题颜色公式 SHALL 从 `mix(0.4) alpha(0.5)` 调整为 `mix(0.6) alpha(0.85)`，以提升在浅色和深色背景上的可读性。`isLightBg` 阈值（luminance > 0.18）保持不变。

#### Scenario: 浅色背景磁贴标题

- **WHEN** 磁贴背景色 luminance > 0.18（如 `#f6f3ec`），磁贴有标题
- **THEN** 标题颜色 SHALL 由背景色与 `#1a1a18` 按 0.6 比例混合后取 alpha 0.85，相比之前的 0.4/0.5 显著加深

#### Scenario: 深色背景磁贴标题

- **WHEN** 磁贴背景色 luminance ≤ 0.18（如 `#191919`），磁贴有标题
- **THEN** 标题颜色 SHALL 由背景色与 `#ffffff` 按 0.6 比例混合后取 alpha 0.85，比之前更亮、可读性更好
