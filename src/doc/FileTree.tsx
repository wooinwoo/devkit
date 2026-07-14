import { type DocKind, type TreeNode } from "./types";
import { useDocs } from "./store";

const BADGE: Record<DocKind, string> = {
  markdown: "MD",
  html: "HTML",
  image: "IMG",
  video: "VID",
  text: "TXT",
  hwp: "HWP",
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

function Node({ node }: { node: TreeNode }) {
  const { openPaths, activePath } = useDocs();

  if (node.isDir) {
    return (
      <li>
        <details open>
          <summary className="cursor-pointer list-none py-1 font-mono text-xs text-muted marker:content-none hover:text-fg">
            <span className="text-faint">▸ </span>
            {node.name}
          </summary>
          <ul className="ml-3 border-l border-line-soft pl-1.5">
            {node.children?.map((c) => (
              <Node key={c.path} node={c} />
            ))}
          </ul>
        </details>
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
  const { folder, openDocs, activePath, select } = useDocs();

  // 폴더가 열려 있으면 트리, 아니면 '열린 문서' 평면 리스트로 폴백
  if (folder) {
    if (folder.tree.length === 0) {
      return (
        <p className="px-2 py-3 text-xs text-faint">
          이 폴더에 .md / .html 문서가 없어요.
        </p>
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

  return (
    <p className="px-2 py-3 text-xs leading-relaxed text-faint">
      파일 열기 또는 폴더 열기로 문서를 불러오세요.
    </p>
  );
}
