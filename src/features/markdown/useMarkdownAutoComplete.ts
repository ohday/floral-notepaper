import type { KeyboardEvent } from "react";

/**
 * 在 textarea 上按回车时，根据当前行 pattern 自动延续 Markdown 列表 / 引用 / 缩进。
 * 编辑器和磁贴编辑模式共用，约束：
 *   - 不在 IME 输入过程中触发（保护中文候选词回车）
 *   - 检测顺序：任务列表 → 有序 → 无序 → 引用 → 缩进
 *   - 空 marker 行回车 = 清空该行（退出列表）
 *
 * 以"controlled component"方式工作：调用方持有 value/setValue。
 * 修改后会同步把光标定位到新插入文本之后（next animation frame，等 React 把新值落到 DOM 上）。
 */
export interface AutoCompleteContext {
  value: string;
  setValue: (next: string) => void;
}

interface LineEditResult {
  /** 替换：把当前行整行替换为 newLine（用于"清空 marker 退出列表"） */
  replaceLine?: string;
  /** 插入：在光标处插入 textToInsert */
  insert?: string;
}

const TASK_LIST_RE = /^(\s*)- \[[ xX]\] (.*)$/;
const ORDERED_LIST_RE = /^(\s*)(\d+)\. (.*)$/;
const UNORDERED_LIST_RE = /^(\s*)- (.*)$/;
const BLOCKQUOTE_RE = /^(\s*)> (.*)$/;
const INDENT_RE = /^(\s+)(.+)$/;

function decideEdit(currentLine: string): LineEditResult | null {
  // 1) 任务列表（必须先于普通无序列表）
  const taskMatch = TASK_LIST_RE.exec(currentLine);
  if (taskMatch) {
    const [, indent, body] = taskMatch;
    if (body.length === 0) {
      return { replaceLine: indent };
    }
    return { insert: `\n${indent}- [ ] ` };
  }

  // 2) 有序列表
  const orderedMatch = ORDERED_LIST_RE.exec(currentLine);
  if (orderedMatch) {
    const [, indent, num, body] = orderedMatch;
    if (body.length === 0) {
      return { replaceLine: indent };
    }
    const next = Number(num) + 1;
    return { insert: `\n${indent}${next}. ` };
  }

  // 3) 无序列表
  const unorderedMatch = UNORDERED_LIST_RE.exec(currentLine);
  if (unorderedMatch) {
    const [, indent, body] = unorderedMatch;
    if (body.length === 0) {
      return { replaceLine: indent };
    }
    return { insert: `\n${indent}- ` };
  }

  // 4) 引用块
  const blockquoteMatch = BLOCKQUOTE_RE.exec(currentLine);
  if (blockquoteMatch) {
    const [, indent, body] = blockquoteMatch;
    if (body.length === 0) {
      return { replaceLine: indent };
    }
    return { insert: `\n${indent}> ` };
  }

  // 5) 普通缩进保留
  const indentMatch = INDENT_RE.exec(currentLine);
  if (indentMatch) {
    const [, indent] = indentMatch;
    return { insert: `\n${indent}` };
  }

  return null;
}

/**
 * 处理 textarea 的 Enter 键。返回 true 表示已处理（已 preventDefault），false 表示放行。
 */
export function handleMarkdownEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  ctx: AutoCompleteContext,
): boolean {
  if (event.key !== "Enter") return false;
  if (event.nativeEvent.isComposing) return false;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;

  const textarea = event.currentTarget;
  const { value } = ctx;
  const cursor = textarea.selectionStart;
  const cursorEnd = textarea.selectionEnd;
  if (cursor !== cursorEnd) return false; // 有选区时不接管，让浏览器原生删除选区

  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const lineEndIdx = value.indexOf("\n", cursor);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const currentLine = value.slice(lineStart, lineEnd);

  // 仅在光标位于行尾时延续；行中回车走原生（避免在已有内容中间插不连贯文本）
  if (cursor !== lineEnd) return false;

  const decision = decideEdit(currentLine);
  if (!decision) return false;

  event.preventDefault();

  if (decision.replaceLine !== undefined) {
    const next = value.slice(0, lineStart) + decision.replaceLine + value.slice(lineEnd);
    ctx.setValue(next);
    const newCursor = lineStart + decision.replaceLine.length;
    queueMicrotask(() => {
      textarea.selectionStart = newCursor;
      textarea.selectionEnd = newCursor;
    });
    return true;
  }

  if (decision.insert !== undefined) {
    const next = value.slice(0, cursor) + decision.insert + value.slice(cursor);
    ctx.setValue(next);
    const newCursor = cursor + decision.insert.length;
    queueMicrotask(() => {
      textarea.selectionStart = newCursor;
      textarea.selectionEnd = newCursor;
    });
    return true;
  }

  return false;
}

/** 暴露给单元测试：纯函数，便于在不构造 KeyboardEvent 的情况下断言 */
export const __test = { decideEdit };
