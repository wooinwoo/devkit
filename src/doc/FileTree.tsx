import { useMemo, useState } from "react";
import { type DocKind, type TreeNode, kindOf } from "./types";
import { useDocs } from "./store";
import { usePrefs } from "../workspace/prefs";

/** 이름으로 트리 필터 — 파일은 이름 매칭, 폴더는 이름 매칭이거나 하위에 매칭 있으면 유지 */
function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.isDir) {
      if (n.name.toLowerCase().includes(q)) {
        out.push(n); // 폴더명 매칭 → 하위 전체 표시
      } else {
        const kids = filterTree(n.children ?? [], q);
        if (kids.length) out.push({ ...n, children: kids });
      }
    } else if (n.name.toLowerCase().includes(q)) {
      out.push(n);
    }
  }
  return out;
}

const BADGE: Record<DocKind, string> = {
  markdown: "MD",
  html: "HTML",
  image: "IMG",
  video: "VID",
  text: "TXT",
  hwp: "HWP",
  pdf: "PDF",
  xlsx: "XLS",
  pptx: "PPT",
  docx: "DOCX",
};

function KindBadge({ kind }: { kind?: DocKind }) {
  if (!kind) return null;
  return (
    <span
      className={`shrink-0 rounded px-1 py-px font-mono text-[9px] font-semibold ${
        kind === "markdown" ? "bg-accent/12 text-accent" : "bg-fg/8 text-muted"
      }`}
    >
      {BADGE[kind]}
    </span>
  );
}

function extLabel(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "FILE";
}

function Node({ node, forceOpen }: { node: TreeNode; forceOpen?: boolean }) {
  const { openPaths, activePath } = useDocs();
  const { collapsedDirs, toggleDir } = usePrefs();

  if (node.isDir) {
    const empty = !node.children || node.children.length === 0;
    // 접힘 상태는 prefs 에 저장 → 저장/재스캔으로 트리가 교체돼도 유지
    // 검색 중이면(forceOpen) 강제로 펼침
    const open = forceOpen || (!empty && !collapsedDirs.includes(node.path));
    return (
      <li>
        <details
          open={open}
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            if (isOpen === open) return; // 상태 일치면 무시 (재렌더 루프 방지)
            if (forceOpen) return; // 검색 중 토글은 무시
            toggleDir(node.path, !isOpen);
          }}
        >
          <summary className="cursor-pointer list-none py-1 font-mono text-xs text-muted marker:content-none hover:text-fg">
            <span className="text-faint">▸ </span>
            {node.name}
            {empty && <span className="ml-1 text-faint">· 빈 폴더</span>}
          </summary>
          {!empty && (
            <ul className="ml-3 border-l border-line-soft pl-1.5">
              {node.children?.map((c) => (
                <Node key={c.path} node={c} forceOpen={forceOpen} />
              ))}
            </ul>
          )}
        </details>
      </li>
    );
  }

  // 못 여는 형식 = 회색으로 표시만 (클릭 불가)
  if (!node.kind) {
    return (
      <li>
        <span
          title="devkit에서 열 수 없는 형식이에요"
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] text-faint"
        >
          <span className="shrink-0 rounded bg-fg/5 px-1 py-px font-mono text-[9px] font-semibold text-faint">
            {extLabel(node.name)}
          </span>
          <span className="truncate">{node.name}</span>
        </span>
      </li>
    );
  }

  const active = activePath === node.path;
  return (
    <li>
      <button
        type="button"
        onClick={() => openPaths([node.path])}
        aria-current={active}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] transition-colors ${
          active ? "bg-surface text-fg" : "text-text hover:bg-surface/60"
        }`}
      >
        <KindBadge kind={node.kind} />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

export function FileTree() {
  const { folder, openDocs, activePath, select, openPaths, recentFiles } =
    useDocs();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const tree = folder?.tree ?? [];
  const filtered = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);

  // 폴더가 열려 있으면 트리(+검색), 아니면 '열린 문서' 평면 리스트로 폴백
  if (folder) {
    return (
      <div className="flex flex-col">
        <div className="px-1 pb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="파일 검색"
            aria-label="파일 검색"
            className="w-full rounded-md border border-line-soft bg-bg px-2.5 py-1 text-xs text-text outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        {folder.tree.length === 0 ? (
          <p className="px-2 py-3 text-xs text-faint">이 폴더는 비어 있어요.</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-faint">
            "{query}" 결과가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((n) => (
              <Node key={n.path} node={n} forceOpen={!!q} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (openDocs.length > 0) {
    return (
      <ul className="flex flex-col">
        {openDocs.map((d) => (
          <li key={d.path}>
            <button
              type="button"
              onClick={() => select(d.path)}
              aria-current={activePath === d.path}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] transition-colors ${
                activePath === d.path
                  ? "bg-surface text-fg"
                  : "text-text hover:bg-surface/60"
              }`}
            >
              <KindBadge kind={d.kind} />
              <span className="truncate">{d.name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  // 열린 문서·폴더가 없으면 최근 파일
  if (recentFiles.length > 0) {
    return (
      <div>
        <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">
          최근 파일
        </p>
        <ul className="flex flex-col">
          {recentFiles.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => openPaths([p])}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] text-text transition-colors hover:bg-surface/60"
              >
                <KindBadge kind={kindOf(p) ?? undefined} />
                <span className="truncate">{p.split(/[\\/]/).pop()}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className="px-2 py-3 text-xs leading-relaxed text-faint">
      파일 열기 또는 폴더 열기로 문서를 불러오세요.
    </p>
  );
}
