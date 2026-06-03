## Why

磁贴模式（surfaceMode === "tile"）目前只能作为只读展示窗口，且存在一系列影响日常使用的细节问题：

- 编辑列表和引用时回车后需要手动补 `- `、`>`、序号，打断书写节奏
- 想修改磁贴里的内容必须先切回 pad 模式，操作链条长
- 磁贴标题颜色过淡（mix 0.4, alpha 0.5），读起来吃力
- 磁贴颜色是全局唯一配置项，不能"一便签一色"，无法用颜色做信息分组
- Markdown 图片在磁贴里被强制 `w-[50%]` 居中渲染，磁贴里出现大片空白，违和

这些问题集中在磁贴模式上，且互相之间几乎无耦合，适合作为一组前端为主、Rust schema 极小改动的优化一次性发版。

## What Changes

- **新增**：编辑器和磁贴编辑模式下，回车自动补全 Markdown 列表（`-` / `1.` / `- [ ]`）、引用 `>`、缩进保留；空 bullet 上回车清空（退出列表）
- **新增**：磁贴双击进入就地编辑（[只读] ⇄ [编辑]），点外面 / Esc 退出，复用现有 900ms 自动保存
- **修改**：磁贴标题颜色公式 `mix 0.4 / alpha 0.5` → `mix 0.6 / alpha 0.85`，提升可读性
- **修改**：每个磁贴拥有独立颜色，跟随笔记持久化（NoteMetadata 增加 `tile_color`）；新磁贴默认值 = 最近被调过色的笔记颜色（复用现有 `AppConfig.tile_color` 作为"最后调过的色"，不增配置项）
- **修改**：磁贴里 Markdown 图片渲染从 `w-[50%] mx-auto` 改为边到边铺满（width 100%、抵消父级 px-4 内边距），仅在磁贴上下文生效，编辑器渲染保持原样

## Capabilities

### New Capabilities

- `tile-mode`: 磁贴窗口的展示与就地编辑能力（双击编辑、状态机、外观保留、颜色调整入口）
- `markdown-autocomplete`: 编辑器和磁贴编辑共用的 Markdown 列表 / 引用 / 缩进自动补全行为
- `note-tile-color`: 笔记级磁贴颜色的持久化、回退与"最后调过的色"复用规则

### Modified Capabilities

<!-- 项目尚未沉淀正式 spec，三项均按"新增 capability"处理 -->

## Impact

- **前端**：
  - `src/components/Tile.tsx`：标题颜色公式调整、新增可选编辑入口
  - `src/components/NotePad.tsx`：磁贴双击进入编辑、Esc / 点外面退出、共享 textarea 行为
  - `src/features/markdown/MarkdownPreview.tsx`：图片渲染按 `imageMode` 区分上下文（或新增 CSS scope `.tile-md`）
  - 新文件：`src/features/markdown/useMarkdownAutoComplete.ts`（hook，编辑器和磁贴 textarea 共用）
  - `src/features/settings/tileColor.ts`：新增 `resolveNoteTileColor(note, config)` 回退链
- **Rust 后端**：
  - `src-tauri/src/services/notes.rs`：`Note` 与 `NoteMetadata` 增加 `tile_color: Option<String>` 字段（`#[serde(default)]`，迁移零成本）
  - 现有 `.notes-meta.json` 旧文件无须迁移脚本，缺字段时反序列化为 `None`
- **配置**：
  - 不新增配置项；`AppConfig.tile_color` 原"全局磁贴色"在新语义下充当"最后调过的色 / 没有自定义色时的回退"
- **测试**：
  - 新增 `useMarkdownAutoComplete.test.ts`、`tileColor.test.ts`（扩展回退链用例）
  - `NotePad` 双击编辑路径建议加 e2e/集成测试覆盖
- **不动**：
  - 全局快捷键、托盘菜单、设置面板大结构、i18n 文案体系
