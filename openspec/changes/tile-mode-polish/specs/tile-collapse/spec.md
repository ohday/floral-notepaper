## ADDED Requirements

### Requirement: 双击标题栏带切换折叠态

`tile-collapse` capability SHALL 提供"完整 ⇄ 折叠"两态切换，由双击标题栏带（顶部 32px）触发。折叠态实际改变 Tauri Window 尺寸，并把折叠状态持久化到 `note.tile_layout.collapsed`。

#### Scenario: 完整态双击折叠

- **WHEN** 磁贴 collapsed=false，用户双击 `[data-tile-titlebar="true"]` 区域
- **THEN** 系统设 collapsed=true，调用 `Window.setSize({ width: collapsedWidth, height: 32 })`
- **AND** 正文区 `display:none`
- **AND** 防抖写入 note.tile_layout（仅 x/y/collapsed，跳过 width/height）

#### Scenario: 折叠态双击展开

- **WHEN** 磁贴 collapsed=true，用户双击标题栏带
- **THEN** 系统设 collapsed=false，调用 `Window.setSize({ width: layout.width, height: layout.height })`
- **AND** 正文区恢复显示

### Requirement: 折叠态最小宽度

折叠态的窗口宽度 SHALL 至少为 120px，且不强制小于 layout 中保存的"展开宽度"。

#### Scenario: 折叠宽度的保底

- **WHEN** 用户触发折叠
- **THEN** 折叠后窗口 width = max(120, 标题字符串 + 关闭按钮 + 16px padding 估值)

#### Scenario: 标题极长时折叠 width 由 CSS 截断

- **WHEN** 标题字符串很长
- **THEN** 折叠 width 不会无限延伸；超出 240px 上限的部分由 CSS `text-overflow: ellipsis` 截断显示

### Requirement: 折叠状态在重启后恢复

`note.tile_layout.collapsed` SHALL 在重启应用后被读取并应用，使用户上次留在折叠态的磁贴重启后仍是折叠态。

#### Scenario: 重启后磁贴恢复折叠

- **WHEN** 上次会话用户折叠了笔记 A 的磁贴并关闭
- **AND** 重启应用并打开笔记 A 的磁贴
- **THEN** 磁贴初始就是折叠态（collapsed=true，高 32px）

#### Scenario: 重启后磁贴恢复完整

- **WHEN** 上次会话用户处于完整态（或没有 tile_layout）
- **THEN** 磁贴初始为完整态
