import type { Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * 给 hast block-level 节点挂 `data-md-line-start={position.start.line}`，
 * 用于磁贴双击进编辑时把光标定位到 Markdown 源码的对应行行首（D2）。
 *
 * 注：需要 react-markdown 配合 `remarkParse({ position: true })`，默认开启。
 * 即使没有 position 信息也安全 no-op。
 */
const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "hr",
  "table",
  "ul",
  "ol",
]);

export function rehypeMdLineStart() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (!BLOCK_TAGS.has(node.tagName)) return;
      const line = node.position?.start?.line;
      if (typeof line !== "number") return;
      node.properties = node.properties ?? {};
      // hast 属性键用 camelCase；react-markdown 序列化时转 data-md-line-start
      (node.properties as Record<string, unknown>)["dataMdLineStart"] = String(line);
    });
  };
}
