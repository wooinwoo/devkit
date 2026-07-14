import { useEffect, useRef, useState } from "react";
import { init } from "pptx-preview";
import { readBinary } from "./fs";

/** PowerPoint 뷰어 — pptx-preview 로 슬라이드 렌더 (레이아웃 근사) */
export function PptxView({ path }: { path: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const bytes = await readBinary(path);
        const host = hostRef.current;
        if (cancelled || !host) return;
        host.replaceChildren();
        const previewer = init(host, {
          width: host.clientWidth || 900,
          mode: "list",
        });
        // Uint8Array → ArrayBuffer
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        await previewer.preview(ab);
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setErr((e as Error).message ?? String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="h-full overflow-auto bg-bg-deep/50 p-6">
      {err && (
        <p className="text-center text-sm text-rose">ppt 렌더 실패: {err}</p>
      )}
      {loading && !err && (
        <p className="text-center text-sm text-faint">슬라이드 렌더링 중…</p>
      )}
      <div ref={hostRef} className="mx-auto max-w-4xl" />
    </div>
  );
}
