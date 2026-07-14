import { useMemo } from "react";
import { useDocs } from "./store";

interface Heading {
  level: number;
  text: string;
  id: string;
}

/** 마크다운 원문에서 헤딩만 추출 (코드펜스 안 제외) */
function parseHeadings(md: string): Heading[] {
  const lines = md.split("\n");
  const out: Heading[] = [];
  let inFence = false;
  let i = 0;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      out.push({ level: m[1].length, text: m[2].trim(), id: `h-${i}` });
      i++;
    }
  }
  return out;
}

export function Outline() {
  const { activeDoc } = useDocs();
  const headings = useMemo(
    () =>
      activeDoc?.kind === "markdown"
        ? parseHeadings(activeDoc.content)
        : [],
    [activeDoc],
  );

  if (!activeDoc) {
    return (
      <p className="px-2 py-3 text-xs text-faint">문서를 열면 목차가 여기 떠요.</p>
    );
  }
  if (headings.length === 0) {
    return <p className="px-2 py-3 text-xs text-faint">제목이 없는 문서예요.</p>;
  }

  const min = Math.min(...headings.map((h) => h.level));

  return (
    <nav aria-label="문서 목차">
      <ul className="flex flex-col">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => {
                // 에디터 본문에서 같은 텍스트의 헤딩으로 스크롤
                const nodes = document.querySelectorAll(
                  ".milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6",
                );
                for (const n of nodes) {
                  if (n.textContent?.trim() === h.text) {
                    n.scrollIntoView({ behavior: "smooth", block: "start" });
                    break;
                  }
                }
              }}
              className="block w-full truncate rounded px-2 py-1 text-left text-[13px] text-text transition-colors hover:bg-surface hover:text-fg"
              style={{ paddingLeft: `${(h.level - min) * 12 + 8}px` }}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
