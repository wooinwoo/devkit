import { useEffect, useState } from "react";
import { mediaSrc } from "./fs";

function useMediaSrc(path: string): string {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    mediaSrc(path).then((s) => {
      if (!cancelled) setSrc(s);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return src;
}

/** 이미지 뷰어 — Tauri asset(또는 브라우저 경로)로 로컬 이미지 표시 */
export function ImageView({ path }: { path: string }) {
  const src = useMediaSrc(path);
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-bg-deep/40 p-6">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={path.split(/[\\/]/).pop() ?? "이미지"}
          className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
        />
      )}
    </div>
  );
}

/** 영상 뷰어 — webview 코덱 범위 내 재생 (H.264 mp4·webm 등) */
export function VideoView({ path }: { path: string }) {
  const src = useMediaSrc(path);
  return (
    <div className="flex h-full items-center justify-center bg-black/90 p-4">
      {src && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={src} controls className="max-h-full max-w-full rounded-lg" />
      )}
    </div>
  );
}
