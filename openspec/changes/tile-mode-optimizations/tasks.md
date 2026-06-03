## 1. 后端 schema（笔记颜色字段）

- [x] 1.1 在 `src-tauri/src/services/notes.rs` 给 `Note`、`NoteMetadata`、`SaveNoteRequest` 新增 `tile_color: Option<String>`，配 `#[serde(default, skip_serializing_if = "Option::is_none")]`
- [x] 1.2 调整 `save_note` / `update_note` 流程，把 `tile_color` 从请求透传到持久化（`.notes-meta.json` 与文件 frontmatter 任一现行存储路径）
- [x] 1.3 调整 `metadata_from_note` 之类的辅助函数，确保 metadata 同步携带 `tile_color`
- [x] 1.4 `cargo check --manifest-path src-tauri/Cargo.toml` 通过

## 2. 前端类型与 API 对齐

- [x] 2.1 `src/features/notes/types.ts`：`NoteMetadata`、`Note`、`SaveNoteRequest` 增加可选 `tileColor?: string`
- [x] 2.2 `src/features/notes/api.ts`：`createNote` / `updateNote` 透传 `tileColor`，类型同步
- [x] 2.3 `src/features/settings/tileColor.ts`：新增 `resolveNoteTileColor(note, config)`，按 D4 三段回退实现

## 3. Markdown 自动补全 hook

- [x] 3.1 新建 `src/features/markdown/useMarkdownAutoComplete.ts`，导出 `handleEnterKey(event, { value, setValue, textareaRef })`
- [x] 3.2 实现按 `任务列表 → 有序 → 无序 → 引用 → 缩进` 顺序的检测与替换逻辑（含空 marker 退出、IME 候选保护）
- [x] 3.3 新建 `src/features/markdown/useMarkdownAutoComplete.test.ts`，覆盖 5 种 pattern × (非空 / 空 marker) + IME 短路 + 普通文本不拦截，共 ~12 例
- [x] 3.4 在 `src/components/NotePad.tsx` 的内容 textarea `onKeyDown` 接入 hook（早于现有 ArrowUp 跳标题逻辑）

## 4. 磁贴双击编辑（D1）

- [x] 4.1 `NotePad.tsx` 增加 `tileEditing: boolean` 状态，`isTile && tileEditing` 时把内容区从 `<Tile>` 默认渲染换为内含 textarea 的版本
- [x] 4.2 在 `<Tile>` 内容区双击进入编辑（注意排除关闭按钮、resize 句柄、rich content 区域内的链接 / 图片）；在 `Tile.tsx` 加可选 `onContentDoubleClick` 回调或在 NotePad 直接挂载
- [x] 4.3 textarea 接入第 3 步的 hook + 现有 imagePasteHandler / dropHandler
- [x] 4.4 退出：监听 document `pointerdown`，target 不在磁贴 root 内则退出；textarea `onKeyDown` 拦截 Escape 退出
- [x] 4.5 退出时不主动 save，依靠 `setStatus("dirty")` + 现有 noteSurfaceAutoSave 的 900ms 防抖路径
- [x] 4.6 进入编辑时 textarea 自动聚焦，光标置于内容末尾

## 5. 标题颜色加深（D3）

- [x] 5.1 `Tile.tsx` 第 93 行 `titleColor` 改为 `chroma.mix(tileColor, mixTarget, 0.6).alpha(0.85).css()`
- [x] 5.2 视觉过一遍浅色（`#f6f3ec`）和深色（`#191919`）默认背景，确认无回退到不可读

## 6. 磁贴颜色调整入口（D6）

- [x] 6.1 `src/features/windows/tileContextMenu.ts` 增加 "调整颜色…" 菜单项，触发自定义事件 `tile:open-color-picker`
- [x] 6.2 `NotePad.tsx` 监听该事件 → 编程式触发隐藏的 `<input type="color">`（ref 持有）
- [x] 6.3 onChange：① `setTileColor(newColor)` 立即视觉反馈，② 300ms debounce 后 `updateNote(noteId, { ..., tileColor })` + `setConfig({ tileColor: newColor })`
- [x] 6.4 i18n 直接复用现有 key 或加最小的 `tile.contextMenu.adjustColor` （仅必要的一条，不动其它文案）

## 7. 颜色回退接入（D4）

- [x] 7.1 `NotePad.tsx` 渲染磁贴时，把 `tileColor` 来源改为 `resolveNoteTileColor(currentNote, config)`，而不是只看 config
- [x] 7.2 监听 `notes-changed` 事件时也同步重算 tileColor（防止其它窗口改色后本窗口显示陈旧）
- [x] 7.3 `tileColor.test.ts` 加用例：覆盖三段回退

## 8. 磁贴里图片铺满（D5）

- [x] 8.1 `Tile.tsx` 给包裹 `MarkdownPreview` 的 div 加 `className="tile-md"`
- [x] 8.2 在 `src/App.css`（或 Tailwind globals）加 `.tile-md img { width: calc(100% + 2rem); margin: 0 -1rem; border-radius: 0; display: block; }`
- [x] 8.3 视觉验证：含图 Markdown 在磁贴里铺满；同一笔记在编辑器预览里仍是 50% 居中

## 9. 编译 & 验证

- [x] 9.1 `npm test` 全部通过（含新的 hook 测试 + tileColor 测试）
- [x] 9.2 `npm run lint` 无新增 error
- [x] 9.3 `npm run build` TypeScript 编译通过
- [x] 9.4 `npm run tauri build` release 编译通过，产物在 `src-tauri/target/release/bundle/nsis/`
- [x] 9.5 `openspec validate tile-mode-optimizations` 通过

## 10. 提交与推送

- [ ] 10.1 `git config user.name ohday`、`git config user.email ohday@163.com`（仅本仓库）
- [ ] 10.2 `git remote set-url origin https://github.com/ohday/floral-notepaper.git`
- [ ] 10.3 `git checkout -b feat/tile-mode-optimizations`
- [ ] 10.4 分组 commit（按上述 1-8 的边界）
- [ ] 10.5 `git push -u origin feat/tile-mode-optimizations`
