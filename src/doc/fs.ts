// 파일 브리지 — 다이얼로그는 plugin-dialog, 읽기/쓰기/폴더순회는 Rust 커맨드.
// (파일연결로 온 경로는 plugin-fs scope 밖이라 Rust std::fs 커맨드로 처리해야 안전)
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ALL_EXTS, type TreeNode, basename, kindOf } from "./types";

const DOC_EXTS = ALL_EXTS;

/** 파일 열기 다이얼로그 (다중 선택). 취소 시 빈 배열. */
export async function pickFiles(): Promise<string[]> {
  const sel = await open({
    multiple: true,
    filters: [{ name: "문서", extensions: DOC_EXTS }],
  });
  if (sel == null) return [];
  return Array.isArray(sel) ? sel : [sel];
}

/** 폴더 열기 다이얼로그. 취소 시 null. */
export async function pickFolder(): Promise<string | null> {
  const sel = await open({ directory: true, multiple: false });
  return typeof sel === "string" ? sel : null;
}

/** 파일 원문 읽기 (Rust 커맨드 — 임의 경로 OK) */
export function readDoc(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/** 바이너리 바이트 읽기 (hwp 등) */
export async function readBinary(path: string): Promise<Uint8Array> {
  const nums = await invoke<number[]>("read_binary", { path });
  return Uint8Array.from(nums);
}

/** 파일 저장 (Rust 커맨드 — 원본 경로 덮어쓰기) */
export function writeDoc(path: string, content: string): Promise<void> {
  return invoke("save_file", { path, content });
}

/** 폴더 재귀 순회 → md/html 트리 (Rust 커맨드) */
export function listDocs(root: string): Promise<TreeNode[]> {
  return invoke<TreeNode[]>("list_docs", { root });
}

/** 앱 최초 실행 시 argv 로 넘어온 파일 경로 (cold start) */
export function startupFile(): Promise<string | null> {
  return invoke<string | null>("get_opened_file");
}

export { basename, kindOf };
