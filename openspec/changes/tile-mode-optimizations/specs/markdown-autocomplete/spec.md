## ADDED Requirements

### Requirement: 编辑器和磁贴编辑模式共享 Markdown 自动补全

系统 SHALL 提供单一 `useMarkdownAutoComplete` hook，可被 NotePad 的编辑 textarea 和磁贴编辑 textarea 共用。该 hook 在用户按下回车键时根据当前行内容自动延续列表 / 引用 / 缩进上下文。

#### Scenario: 在 IME 输入过程中不触发

- **WHEN** 用户在 textarea 输入中文，候选词面板显示，按下回车选择候选词（`event.isComposing === true`）
- **THEN** hook MUST 不调用 preventDefault，让浏览器原生处理选词

### Requirement: 无序列表自动延续

无序列表项行 `^(\s*)- (.+)$` 上回车 SHALL 在下一行自动补 `${indent}- `；空 bullet 行 `^(\s*)- $` 上回车 SHALL 清空该行（保留缩进），用于退出列表。

#### Scenario: 在非空 `-` 行回车

- **WHEN** 当前行匹配 `^(\s*)- (.+)$`，光标在行尾，用户按回车
- **THEN** hook 在光标处插入 `\n${indent}- `，并 preventDefault

#### Scenario: 在空 `-` 行回车（退出列表）

- **WHEN** 当前行匹配 `^(\s*)- $`（bullet 后无内容），用户按回车
- **THEN** hook 把整行替换为 `${indent}`（保留缩进，去掉 bullet），不再插入新行

### Requirement: 任务列表自动延续

任务列表项行 `^(\s*)- \[[ x]\] (.+)$` 上回车 SHALL 自动补 `${indent}- [ ] `（新项默认未勾选）；空任务项行 `^(\s*)- \[[ x]\] $` 上回车 SHALL 清空该行（退出任务列表）。

#### Scenario: 在非空 `- [ ]` / `- [x]` 行回车

- **WHEN** 当前行匹配 `^(\s*)- \[[ x]\] (.+)$`，用户按回车
- **THEN** hook 在光标处插入 `\n${indent}- [ ] `（无论原行是否勾选，新项默认未勾选）

#### Scenario: 在空任务项上回车（退出）

- **WHEN** 当前行匹配 `^(\s*)- \[[ x]\] $`
- **THEN** hook 把整行替换为 `${indent}`

### Requirement: 有序列表自动延续与递增

有序列表项行 `^(\s*)(\d+)\. (.+)$` 上回车 SHALL 自动补 `${indent}${n+1}. `（仅做"上一行 +1"递增，不做整块重排）；空序号行 `^(\s*)(\d+)\. $` 上回车 SHALL 清空该行（退出列表）。

#### Scenario: 在非空 `n.` 行回车

- **WHEN** 当前行匹配 `^(\s*)(\d+)\. (.+)$`，用户按回车
- **THEN** hook 在光标处插入 `\n${indent}${n+1}. `

#### Scenario: 在空 `n.` 行回车（退出）

- **WHEN** 当前行匹配 `^(\s*)(\d+)\. $`
- **THEN** hook 把整行替换为 `${indent}`

### Requirement: 引用块自动延续

引用行 `^(\s*)> (.+)$` 上回车 SHALL 自动补 `${indent}> `；空引用行 `^(\s*)> $` 上回车 SHALL 清空该行（退出引用块）。

#### Scenario: 在非空 `>` 行回车

- **WHEN** 当前行匹配 `^(\s*)> (.+)$`，用户按回车
- **THEN** hook 在光标处插入 `\n${indent}> `

#### Scenario: 在空 `>` 行回车（退出）

- **WHEN** 当前行匹配 `^(\s*)> $`
- **THEN** hook 把整行替换为 `${indent}`

### Requirement: 普通缩进保留

仅有前导空白的非列表 / 非引用行回车 SHALL 在下一行复制相同的前导空白，保持缩进语境。

#### Scenario: 在仅有前导空白的非列表行回车

- **WHEN** 当前行匹配 `^(\s+)(.+)$`，且不匹配上述任何列表 / 引用 pattern，用户按回车
- **THEN** hook 在光标处插入 `\n${indent}`，光标停在缩进末尾

### Requirement: 检测优先级

hook 在判断当前行 pattern 时 SHALL 按 `任务列表 → 有序列表 → 无序列表 → 引用 → 缩进` 顺序匹配，确保更具体的语法先于更宽松的语法被识别（任务列表必须先于普通 `-` 检测，否则 `- [ ] x` 会被误判为无序列表）。

#### Scenario: `- [ ] task` 行被识别为任务列表

- **WHEN** 当前行为 `- [ ] buy milk`
- **THEN** hook MUST 走任务列表分支，下一行补 `- [ ] `，而不是普通无序列表的 `- `
