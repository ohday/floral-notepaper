/**
 * 双击位置 → textarea 字符偏移定位（D2）。
 *
 * 两条路径：
 *   纯文本路径：caretPositionFromPoint / caretRangeFromPoint → Range → 累加文本节点偏移
 *   Markdown 路径（行首退化）：找最近 [data-md-line-start] 祖先 → 算第 N 行行首在 content 里的字符偏移
 *
 * 都失败时退化到内容末尾（保留 v1 行为）。
 */

interface DocumentWithCaretAPIs {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

/**
 * 用 caret API 找到点击位置的 (Node, offset)，统一返回 Range 起点形式。
 * 部分老 webview 没有这俩 API，返回 null。
 */
export function caretFromPoint(
  doc: Document,
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const d = doc as Document & DocumentWithCaretAPIs;
  if (typeof d.caretPositionFromPoint === "function") {
    const pos = d.caretPositionFromPoint(x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }
  if (typeof d.caretRangeFromPoint === "function") {
    const range = d.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/**
 * 在 root 内累加文本节点长度，把 (targetNode, targetOffset) 映射到 root 的全局字符偏移。
 * 仅遍历 textNode（NodeFilter.SHOW_TEXT），与 textarea 字符串语义对齐。
 */
export function offsetWithinRoot(root: Node, targetNode: Node, targetOffset: number): number {
  // 简单情况：targetNode 本身就是 root（少见）
  if (targetNode === root) return targetOffset;
  // 若 targetNode 不在 root 内，回退 0
  if (!root.contains(targetNode)) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  // 如果 targetNode 不是文本节点（比如点在元素边界），尝试以 targetNode 的子元素遍历
  if (targetNode.nodeType === Node.ELEMENT_NODE) {
    const elemWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let n: Node | null = elemWalker.nextNode();
    while (n) {
      if (targetNode.contains(n)) {
        // 把 offset 解释为"target 元素内第 offset 个子节点之前"的累计长度
        // 简单做法：返回累计偏移加上 target 内已遍历的文本长度
        return acc;
      }
      acc += n.textContent?.length ?? 0;
      n = elemWalker.nextNode();
    }
  }
  return 0;
}

/**
 * 给定 content 字符串和 1-based 行号，返回该行第一个字符在 content 里的偏移。
 * 行号 < 1 或 > 总行数时回退到 0 / content.length。
 */
export function lineStartOffset(content: string, lineNumber: number): number {
  if (lineNumber <= 1) return 0;
  let offset = 0;
  let line = 1;
  for (let i = 0; i < content.length; i++) {
    if (line === lineNumber) return offset;
    if (content[i] === "\n") {
      line++;
      offset = i + 1;
    }
  }
  return content.length;
}

/**
 * 主入口：拿到双击 (x, y)，算出应该把 textarea 光标停在 content 的哪个字符偏移。
 *
 * @param mode "plain" 走 caret API + 文本累加；"markdown" 走 [data-md-line-start] 行首退化
 * @param ctx.root 内容显示态的 root 元素（不是 textarea；textarea 还没渲染）
 * @param ctx.doc 当前 document，便于注入测试
 * @param ctx.x / y 屏幕坐标
 * @param ctx.content 笔记 content 字符串（用于行首退化）
 * @returns 字符偏移；任何失败都返回 content.length（v1 末尾行为）
 */
export interface GetCaretOffsetCtx {
  root: HTMLElement | null;
  doc: Document;
  x: number;
  y: number;
  content: string;
}

export function getCaretOffset(mode: "plain" | "markdown", ctx: GetCaretOffsetCtx): number {
  const fallback = ctx.content.length;
  if (!ctx.root) return fallback;

  if (mode === "markdown") {
    // 找点击元素最近的 [data-md-line-start]
    const elem = ctx.doc.elementFromPoint(ctx.x, ctx.y) as HTMLElement | null;
    if (!elem) return fallback;
    const marked = elem.closest<HTMLElement>("[data-md-line-start]");
    if (!marked) return fallback;
    const lineNum = Number(marked.dataset.mdLineStart);
    if (!Number.isFinite(lineNum) || lineNum < 1) return fallback;
    return lineStartOffset(ctx.content, lineNum);
  }

  // plain
  const caret = caretFromPoint(ctx.doc, ctx.x, ctx.y);
  if (!caret) return fallback;
  return offsetWithinRoot(ctx.root, caret.node, caret.offset);
}
