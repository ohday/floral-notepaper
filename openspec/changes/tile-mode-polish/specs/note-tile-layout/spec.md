## ADDED Requirements

### Requirement: 笔记元数据携带磁贴布局

`Note` / `NoteMetadata` / `SaveNoteRequest` SHALL 各包含一个可选字段 `tile_layout: Option<TileLayout>`（serde camelCase 序列化为 `tileLayout`），使用 `#[serde(default, skip_serializing_if = "Option::is_none")]` 保证向前向后兼容。`TileLayout` 结构体包含 `x: i32, y: i32, width: u32, height: u32, collapsed: bool`，`collapsed` 字段也带 `#[serde(default)]`。

#### Scenario: 旧元数据文件向前兼容

- **WHEN** 系统读取一个不包含 `tileLayout` 字段的旧 `.notes-meta.json`
- **THEN** 反序列化成功，`tile_layout` 字段为 `None`，不报错

#### Scenario: 写入笔记时透传布局

- **WHEN** 前端调用 `updateNote(id, { ..., tileLayout: { x: 100, y: 200, width: 280, height: 280, collapsed: false } })`
- **THEN** 后端持久化 `tile_layout: Some(...)` 到 `.notes-meta.json`

#### Scenario: tileLayout 为 None 时不污染输出

- **WHEN** 笔记的 `tile_layout` 为 `None`
- **THEN** 序列化输出 SHALL 省略该字段（保持 JSON 清爽）

#### Scenario: collapsed 字段在反序列化中默认为 false

- **WHEN** `tileLayout` 存在但缺少 `collapsed` 字段
- **THEN** 反序列化成功，`collapsed` 默认 `false`

### Requirement: 磁贴布局的实时持久化

前端在磁贴 surface 处于活动态时 SHALL 监听 Tauri Window 的 `onMoved` 和 `onResized` 事件，并以 500ms 防抖将最新布局写入对应笔记的 `tile_layout`。

#### Scenario: 拖动磁贴触发位置写入

- **WHEN** 用户拖动磁贴使其 position 变化，停止 500ms 后
- **THEN** 系统调用 `updateNote(noteId, { ..., tileLayout: { x: newX, y: newY, width, height, collapsed } })`

#### Scenario: 调整磁贴尺寸触发尺寸写入

- **WHEN** 用户从磁贴边缘 / 角拖动 resize，停止 500ms 后
- **THEN** 系统写入新的 width/height（仅在非折叠态）

#### Scenario: 折叠态期间不覆写展开尺寸

- **WHEN** 磁贴处于折叠态（collapsed=true），onResized 因为 setSize 触发
- **THEN** debounced writer SHALL 跳过 width/height 字段更新；仍可更新 x/y

#### Scenario: 退出磁贴 surface 时清理监听器

- **WHEN** 磁贴 surface 切换到 pad 或窗口卸载
- **THEN** onMoved / onResized 监听器 SHALL 被解除，避免内存泄漏

### Requirement: 进入磁贴时应用持久化布局

切换到磁贴 surface（`switchSurfaceMode("tile")`）或初始为磁贴时，系统 SHALL 优先应用 `note.tileLayout`（若有），否则使用 `AppConfig.surface_width/height` 作为默认尺寸。

#### Scenario: 笔记带布局 → 应用布局

- **WHEN** 用户从 pad 切到 tile，且当前 note.tileLayout 非空且通过越界检查
- **THEN** 系统调用 `setBounds({ x, y, width, height })`，并按 collapsed 字段决定是否进入折叠态

#### Scenario: 笔记无布局 → 用全局默认

- **WHEN** note.tileLayout 为 null
- **THEN** 系统使用 `AppConfig.surface_width/height` 作为尺寸（位置由 Tauri 默认或保留当前位置）

#### Scenario: 折叠状态恢复

- **WHEN** note.tileLayout.collapsed === true
- **THEN** 应用 layout 后立即按折叠态尺寸 resize（高 32px），同时正文区 display:none

### Requirement: 多显示器越界回退

应用磁贴布局前，系统 SHALL 用 Tauri `availableMonitors()` 检查 layout 是否落在任何监视器矩形内。若不在，回退到主屏右下角并保留尺寸。

#### Scenario: 布局落在某个监视器内 → 直接应用

- **WHEN** 存在监视器 m 满足 `m.position.x ≤ layout.x + 50 < m.position.x + m.size.width` 且 `m.position.y ≤ layout.y < m.position.y + m.size.height`
- **THEN** 系统调用 `setBounds(layout)` 直接应用

#### Scenario: 布局落在所有监视器之外 → 主屏右下回退

- **WHEN** 不存在任何监视器满足上面条件
- **THEN** 系统取主屏 `primaryMonitor()`，把磁贴放到 `(primary.position.x + primary.size.width - layout.width - 20, primary.position.y + primary.size.height - layout.height - 20)`，保留 layout 的 width/height

#### Scenario: availableMonitors 返回空（异常情况）

- **WHEN** `availableMonitors()` 返回空数组
- **THEN** 系统跳过越界检查，直接 setBounds(layout)，不抛异常

### Requirement: AppConfig.surface_width/height 语义调整为"默认尺寸"

`AppConfig.surface_width` / `surface_height` 字段的语义 SHALL 从"全局磁贴 + pad 共享尺寸"调整为"默认尺寸"——仅 pad 模式 resize 时写入；tile 模式 resize 不写全局，而是写 `note.tile_layout`。

#### Scenario: pad 模式 resize 仍写 AppConfig

- **WHEN** 当前窗口是 pad surface，用户 resize
- **THEN** desktop.rs 的 `maybe_save_surface_size` 仍照旧把新尺寸写入 `surface_width/height`

#### Scenario: tile 模式 resize 不写 AppConfig

- **WHEN** 当前窗口是 tile surface（label 以 `tile-` 开头或 surface 数据标签为 tile），用户 resize
- **THEN** `maybe_save_surface_size` SHALL 短路返回，不写 AppConfig.surface_width/height

#### Scenario: 旧用户首次升级时 surface_width/height 被读为默认

- **WHEN** 升级后第一次开 tile，note 没有 tile_layout
- **THEN** 系统用 AppConfig.surface_width/height 作为初始尺寸（不变更兼容性）
