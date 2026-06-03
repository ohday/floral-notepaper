## ADDED Requirements

### Requirement: 笔记元数据携带磁贴颜色

`NoteMetadata` 和 `Note` SHALL 在 Rust 端各包含一个可选字段 `tile_color: Option<String>`（serde camelCase 序列化为 `tileColor`），使用 `#[serde(default)]` 以保证旧 JSON 文件反序列化时该字段为 `None`。`SaveNoteRequest` SHALL 同步增加该可选字段。

#### Scenario: 旧元数据文件向前兼容

- **WHEN** 系统读取一个不包含 `tileColor` 字段的旧 `.notes-meta.json`
- **THEN** 反序列化成功，`tile_color` 字段为 `None`，不报错

#### Scenario: 写入笔记时透传颜色

- **WHEN** 前端调用 `updateNote(id, { title, content, category, tileColor: "#abcdef" })`
- **THEN** 后端持久化 `tile_color: Some("#abcdef")` 到 `.notes-meta.json` 及对应文件元数据

#### Scenario: 颜色为 None 时不污染输出

- **WHEN** 笔记的 `tile_color` 为 `None`
- **THEN** 序列化输出可以省略该字段（`#[serde(skip_serializing_if = "Option::is_none")]`），保持 JSON 清爽

### Requirement: 磁贴颜色三段回退

前端 SHALL 提供 `resolveNoteTileColor(note, config)` 函数，返回最终生效的磁贴颜色，回退顺序为：

1. `note.tileColor`（笔记自定义色，最高优先级）
2. `resolveTileColor(config.tileColorMode, config.tileColor)`（应用级"最后调过的色"或系统主题色）
3. `DEFAULT_TILE_COLOR` 常量（最终保底）

#### Scenario: 笔记带自定义色

- **WHEN** `note.tileColor === "#abcdef"`
- **THEN** `resolveNoteTileColor` 返回 `"#abcdef"`

#### Scenario: 笔记无自定义色，配置为 system 模式

- **WHEN** `note.tileColor` 为 null/undefined，`config.tileColorMode === "system"`
- **THEN** `resolveNoteTileColor` 返回 `resolveSystemTileColor()` 的结果（亮 `#f6f3ec` / 暗 `#191919`）

#### Scenario: 笔记无自定义色，配置为 custom 模式

- **WHEN** `note.tileColor` 为 null/undefined，`config.tileColorMode === "custom"`，`config.tileColor === "#aabbcc"`
- **THEN** `resolveNoteTileColor` 返回 `"#aabbcc"`

### Requirement: AppConfig.tile_color 语义复用为"最后调过的色"

`AppConfig.tile_color` 字段 SHALL 在用户对任意笔记调整磁贴颜色时同步更新，作为新创建磁贴 / 没有自定义色的笔记的默认值。该字段的物理 schema 不变，仅语义扩展。

#### Scenario: 调色后写两处

- **WHEN** 用户在磁贴 A 上把颜色调为 `#abcdef`
- **THEN** 系统 ① 调用 `updateNote(A.id, ...{ tileColor: "#abcdef" })`，② 调用 `setConfig({ tileColor: "#abcdef" })`

#### Scenario: 后续新磁贴默认色

- **WHEN** 在上一步之后，用户从一篇没有 `tileColor` 字段的笔记 B 创建新磁贴
- **THEN** 该磁贴渲染颜色为 `#abcdef`（来自 config.tileColor 回退）

#### Scenario: 调色不影响其它已设置颜色的笔记

- **WHEN** 笔记 C 已有 `tileColor: "#cccccc"`，用户在磁贴 A 上调色为 `#abcdef`
- **THEN** 笔记 C 的磁贴颜色仍为 `#cccccc`，不受影响
