import chroma from "chroma-js";
import type { CSSProperties, HTMLAttributes } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TILE_COLOR, normalizeTileColor } from "../features/settings/tileColor";
import { MarkdownPreview } from "../features/markdown/MarkdownPreview";

export interface TileProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "color" | "content" | "title"
> {
  title?: string;
  content: string;
  color?: string;
  width?: number | string;
  rotation?: number;
  fontSize?: number;
  renderMarkdown?: boolean;
  imageBaseDir?: string;
  /** 折叠态：内容区隐藏，仅保留标题栏带（D6） */
  collapsed?: boolean;
}

const MARK_SIZE = 8;
const MARK_OFFSET = 6;

const cornerPaths = [
  {
    pos: { top: MARK_OFFSET, left: MARK_OFFSET },
    d: `M0,${MARK_SIZE} L0,0 L${MARK_SIZE},0`,
  },
  {
    pos: { top: MARK_OFFSET, right: MARK_OFFSET },
    d: `M0,0 L${MARK_SIZE},0 L${MARK_SIZE},${MARK_SIZE}`,
  },
  {
    pos: { bottom: MARK_OFFSET, left: MARK_OFFSET },
    d: `M0,0 L0,${MARK_SIZE} L${MARK_SIZE},${MARK_SIZE}`,
  },
  {
    pos: { bottom: MARK_OFFSET, right: MARK_OFFSET },
    d: `M${MARK_SIZE},0 L${MARK_SIZE},${MARK_SIZE} L0,${MARK_SIZE}`,
  },
];

function CornerMarks({ color }: { color: string }) {
  return (
    <>
      {cornerPaths.map((mark, index) => (
        <svg
          key={index}
          className="absolute pointer-events-none"
          data-tile-corner-mark="true"
          style={mark.pos as CSSProperties}
          width={MARK_SIZE}
          height={MARK_SIZE}
          viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
        >
          <path
            d={mark.d}
            stroke={color}
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </>
  );
}

export function Tile({
  title,
  content,
  color = DEFAULT_TILE_COLOR,
  width = 260,
  rotation = 0,
  fontSize = 14,
  renderMarkdown = false,
  imageBaseDir,
  collapsed = false,
  className = "",
  style,
  children,
  ...divProps
}: TileProps) {
  const { t } = useTranslation();
  const tileColor = normalizeTileColor(color);
  const { borderColor, cornerColor, titleColor, contentColor, emptyColor } = useMemo(() => {
    const isLightBg = chroma(tileColor).luminance() > 0.18;
    const mixTarget = isLightBg ? "#1a1a18" : "#ffffff";
    return {
      borderColor: chroma.mix(tileColor, mixTarget, 0.18).alpha(0.55).css(),
      cornerColor: chroma.mix(tileColor, mixTarget, 0.3).alpha(0.26).css(),
      titleColor: chroma.mix(tileColor, mixTarget, 0.78).alpha(0.95).css(),
      contentColor: chroma.mix(tileColor, mixTarget, 0.65).alpha(0.85).css(),
      emptyColor: chroma.mix(tileColor, mixTarget, 0.25).alpha(0.4).css(),
    };
  }, [tileColor]);
  const mergedStyle: CSSProperties = {
    width,
    backgroundColor: tileColor,
    borderColor,
    transition: "box-shadow 0.3s ease",
    ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}),
    ...style,
  };

  return (
    <div
      {...divProps}
      className={`app-surface-frame relative border overflow-hidden select-none shadow-[0_1px_8px_rgba(26,26,24,0.04)] hover:shadow-[0_6px_24px_rgba(26,26,24,0.07)] ${className}`}
      style={mergedStyle}
    >
      {/* 标题栏带（顶部 32px，承担 双击折叠/展开 + 拖拽区域 + 标题文字） */}
      <div
        data-tile-titlebar="true"
        className="absolute top-0 left-0 right-0 h-8 px-4 flex items-center"
      >
        {title && (
          <div
            className="font-display tracking-wide leading-snug truncate pr-24 pointer-events-none"
            style={{ color: titleColor, fontSize: `${fontSize + 1}px` }}
          >
            {title}
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          data-tile-content="true"
          className="px-4 pt-10 pb-4 h-full overflow-y-auto scrollbar-hidden"
        >
          {content ? (
            renderMarkdown ? (
              <div
                className="tile-md"
                data-tile-text-root="markdown"
                style={{ color: contentColor }}
              >
                <MarkdownPreview
                  content={content}
                  fontSize={fontSize}
                  renderHtml={false}
                  imageBaseDir={imageBaseDir}
                  markLines={true}
                />
              </div>
            ) : (
              <div
                className="leading-[1.8] whitespace-pre-wrap font-body"
                data-tile-text-root="plain"
                style={{ color: contentColor, fontSize: `${fontSize}px` }}
              >
                {content}
              </div>
            )
          ) : (
            <div
              className="font-body text-center py-6"
              style={{ color: emptyColor, fontSize: `${fontSize}px` }}
            >
              {t("tile.empty", { defaultValue: "空" })}
            </div>
          )}
        </div>
      )}

      <CornerMarks color={cornerColor} />
      {children}
    </div>
  );
}
