import { convertFileSrc } from "@tauri-apps/api/core";

/** 이미지 뷰어 — Tauri asset 프로토콜로 로컬 이미지 표시 */
export function ImageView({ path }: { path: string }) {
  const src = safeSrc(path);
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-bg-deep/40 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={path.split(/[\\/]/).pop() ?? "이미지"}
        className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
      />
    </div>
  );
}

/** 영상 뷰어 — webview 코덱 범위 내 재생 (H.264 mp4·webm 등) */
export function VideoView({ path }: { path: string }) {
  const src = safeSrc(path);
  return (
    <div className="flex h-full items-center justify-center bg-black/90 p-4">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        controls
        className="max-h-full max-w-full rounded-lg"
      />
    </div>
  );
}

function safeSrc(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}
