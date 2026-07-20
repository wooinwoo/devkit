// 파일 브리지 — 다이얼로그는 plugin-dialog, 읽기/쓰기/폴더순회는 Rust 커맨드.
// (파일연결로 온 경로는 plugin-fs scope 밖이라 Rust std::fs 커맨드로 처리해야 안전)
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ALL_EXTS, type TreeNode, basename, kindOf } from "./types";

// Tauri 런타임 여부 — 없으면(브라우저 개발/테스트) fetch 로 폴백해 뷰어를 검증한다.
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 파일 열기 다이얼로그 (다중 선택). 취소 시 빈 배열. */
export async function pickFiles(): Promise<string[]> {
  const sel = await open({
    multiple: true,
    filters: [{ name: "문서", extensions: ALL_EXTS }],
  });
  if (sel == null) return [];
  return Array.isArray(sel) ? sel : [sel];
}

/** 폴더 열기 다이얼로그. 취소 시 null. */
export async function pickFolder(): Promise<string | null> {
  const sel = await open({ directory: true, multiple: false });
  return typeof sel === "string" ? sel : null;
}

/** 파일 원문 읽기 (Rust 커맨드 — 임의 경로 OK). 브라우저 테스트 시 fetch 폴백 */
export async function readDoc(path: string): Promise<string> {
  if (isTauri) return invoke<string>("read_file", { path });
  return (await fetch(path)).text();
}

/** 바이너리 바이트 읽기 (hwp·pdf·xlsx·pptx 등). 브라우저 테스트 시 fetch 폴백 */
export async function readBinary(path: string): Promise<Uint8Array> {
  if (isTauri) {
    const buffer = await invoke<ArrayBuffer>("read_binary", { path });
    return new Uint8Array(buffer);
  }
  const buf = await (await fetch(path)).arrayBuffer();
  return new Uint8Array(buf);
}

/** 이미지·영상 src — Tauri 는 asset 프로토콜, 브라우저는 경로 그대로 */
export async function mediaSrc(path: string): Promise<string> {
  if (isTauri) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return convertFileSrc(path);
  }
  return path;
}

/** 파일 저장 (Rust 커맨드 — 원본 경로 덮어쓰기) */
export function writeDoc(path: string, content: string): Promise<void> {
  return invoke("save_file", { path, content });
}

/** 바이너리 저장 (이미지 붙여넣기 등) */
export function writeBinary(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("write_binary", bytes, {
    headers: { "x-devkit-path": encodeURIComponent(path) },
  });
}

// 파일 관리 (Rust 커맨드) — 브라우저에선 no-op/throw
export const renamePath = (from: string, to: string): Promise<void> =>
  invoke("rename_path", { from, to });
export async function createFile(path: string): Promise<void> {
  if (!path.toLowerCase().endsWith(".xlsx")) {
    await invoke("create_file", { path });
    return;
  }
  // 0바이트 .xlsx는 열 수 없으므로 편집 가능한 최소 통합문서로 만든다.
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([]);
  sheet["!ref"] = "A1:Z100";
  XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    "Sheet1",
  );
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const bytes = output instanceof Uint8Array ? output : new Uint8Array(output);
  await invoke("create_binary_file", { path, bytes: Array.from(bytes) });
}
export const createDir = (path: string): Promise<void> =>
  invoke("create_dir", { path });
export const deletePath = (path: string): Promise<void> =>
  invoke("delete_path", { path });

/** OS 파일 탐색기에서 항목 보기 */
export async function revealInDir(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
/** OS 기본 앱으로 열기 (devkit 이 못 여는 형식용) */
export async function openWithDefault(path: string): Promise<void> {
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(path);
}

/** 경로의 부모 디렉터리 */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : path;
}
/** 경로 구분자 (플랫폼) */
export function sep(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

/** 폴더 재귀 순회 → md/html 트리 (Rust 커맨드) */
export function listDocs(root: string): Promise<TreeNode[]> {
  return invoke<TreeNode[]>("list_docs", { root });
}

export function isDirectory(path: string): Promise<boolean> {
  return invoke<boolean>("is_dir", { path });
}

/** 앱 최초 실행 시 argv 로 넘어온 파일 경로 (cold start) */
export function startupFiles(): Promise<string[]> {
  return invoke<string[]>("get_opened_files");
}

/** 폴더 변경 감시 — 파일 추가/삭제/수정 시 onChange 호출. unwatch 반환 */
export async function watchFolder(
  root: string,
  onChange: (change: { paths: string[]; affectsTree: boolean }) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  try {
    const { watch } = await import("@tauri-apps/plugin-fs");
    return await watch(root, (event) => {
      const type = event.type;
      const affectsTree =
        type === "any" ||
        type === "other" ||
        (typeof type === "object" &&
          ("create" in type ||
            "remove" in type ||
            ("modify" in type && type.modify.kind === "rename")));
      onChange({ paths: event.paths, affectsTree });
    }, {
      recursive: true,
      delayMs: 600,
    });
  } catch {
    return () => {};
  }
}

export { basename, kindOf };
