import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readBinary } from "./fs";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** PDF 뷰어 — pdf.js 로 페이지를 canvas 렌더 */
export function PdfView({ path }: { path: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const bytes = await readBinary(path);
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const container = containerRef.current;
        if (cancelled || !container) return;
        container.replaceChildren();

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className =
            "mx-auto max-w-full rounded-md bg-white shadow-sm ring-1 ring-line-soft";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
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
        <p className="text-center text-sm text-rose">pdf 렌더 실패: {err}</p>
      )}
      {loading && !err && (
        <p className="text-center text-sm text-faint">PDF 렌더링 중…</p>
      )}
      <div ref={containerRef} className="mx-auto flex max-w-4xl flex-col gap-5" />
    </div>
  );
}
