import { type DocKind, type TreeNode, kindOf } from "./types";
import { useDocs } from "./store";
import { usePrefs } from "../workspace/prefs";

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

function Node({ node }: { node: TreeNode }) {
  const { openPaths, activePath } = useDocs();
  const { collapsedDirs, toggleDir } = usePrefs();

  if (node.isDir) {
    const empty = !node.children || node.children.length === 0;
    // 접힘 상태는 prefs 에 저장 → 저장/재스캔으로 트리가 교체돼도 유지
    const open = !empty && !collapsedDirs.includes(node.path);
    return (
      <li>
        <details
          open={open}
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            if (isOpen === open) return; // 상태 일치면 무시 (재렌더 루프 방지)
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
                <Node key={c.path} node={c} />
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

  // 폴더가 열려 있으면 트리, 아니면 '열린 문서' 평면 리스트로 폴백
  if (folder) {
    if (folder.tree.length === 0) {
      return (
        <p className="px-2 py-3 text-xs text-faint">이 폴더는 비어 있어요.</p>
      );
    }
    return (
      <ul className="flex flex-col">
        {folder.tree.map((n) => (
          <Node key={n.path} node={n} />
        ))}
      </ul>
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
