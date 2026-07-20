export type DocKind =
  | "markdown"
  | "html"
  | "image"
  | "video"
  | "text"
  | "hwp"
  | "pdf"
  | "xlsx"
  | "pptx"
  | "docx"
  | "ipynb";

/** 텍스트로 읽어 편집 가능한 종류인지 (이미지·영상은 바이너리라 제외) */
export function isTextKind(k: DocKind): boolean {
  return k === "markdown" || k === "html" || k === "text";
}

/** 바이너리는 명시적으로 허용한 serializer가 있는 형식만 편집한다. */
export function isEditableDoc(kind: DocKind, path: string): boolean {
  return isTextKind(kind) || (kind === "xlsx" && path.toLowerCase().endsWith(".xlsx"));
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const VIDEO_EXTS = ["mp4", "webm", "ogv", "mov", "m4v"];
const TEXT_EXTS = [
  "txt", "text", "log", "json", "jsonc", "yml", "yaml", "toml",
  "xml", "ini", "conf", "env", "js", "ts", "jsx", "tsx", "css", "scss",
  "py", "rs", "go", "java", "c", "cpp", "h", "sh", "sql",
];

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
  loadId: number;
  error?: string;
}

export type ViewMode = "rich" | "source";

export interface ViewerState {
  folder: { root: string; tree: TreeNode[] } | null;
  openDocs: OpenDoc[];
  activePath: string | null;
  viewMode: ViewMode;
}

export function kindOf(path: string): DocKind | null {
  const lower = path.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "hwp" || ext === "hwpx") return "hwp";
  if (ext === "docx") return "docx";
  if (ext === "ipynb") return "ipynb";
  if (ext === "pdf") return "pdf";
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "tsv")
    return "xlsx";
  if (ext === "pptx") return "pptx";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (TEXT_EXTS.includes(ext)) return "text";
  return null;
}

/** 열기 다이얼로그·폴더 스캔에서 허용할 전체 확장자 */
export const ALL_EXTS = [
  "md", "markdown", "html", "htm", "hwp", "hwpx", "pdf",
  "xlsx", "xls", "csv", "tsv", "pptx", "docx", "ipynb",
  ...IMAGE_EXTS, ...VIDEO_EXTS, ...TEXT_EXTS,
];

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
