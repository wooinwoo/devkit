export type DocKind = "markdown" | "html";

/** 사이드바 파일 트리 노드 */
export interface TreeNode {
  name: string; // basename
  path: string; // 절대경로 (고유 키)
  isDir: boolean;
  kind?: DocKind; // 파일일 때만
  children?: TreeNode[]; // 디렉터리일 때만
}

/** 열린 문서 = 탭 1개 */
export interface OpenDoc {
  path: string;
  name: string;
  kind: DocKind;
  content: string; // 현재 편집 중인 내용
  saved: string; // 마지막 저장된 내용 (dirty 판정용)
  status: "loading" | "ready" | "error";
  error?: string;
}

export type ViewMode = "preview" | "edit";

export interface ViewerState {
  folder: { root: string; tree: TreeNode[] } | null;
  openDocs: OpenDoc[];
  activePath: string | null;
  viewMode: ViewMode;
  htmlAllowScripts: boolean;
}

export function kindOf(path: string): DocKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return null;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
