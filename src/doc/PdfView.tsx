import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { readBinary } from "./fs";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.5;

/** PDF 뷰어 — pdf.js 로 canvas 렌더 + 텍스트 레이어(선택·복사 가능) */
export function PdfView({ path, zoom = 1 }: { path: string; zoom?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const bytes = await readBinary(path);
        task = pdfjs.getDocument({ data: bytes });
        const pdf = await task.promise;
        const container = containerRef.current;
        if (cancelled || !container) return;
        container.replaceChildren();

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: SCALE });

          const pageDiv = document.createElement("div");
          pageDiv.className = "pdf-page";
          pageDiv.style.width = `${viewport.width}px`;
          pageDiv.style.height = `${viewport.height}px`;
          // v6 텍스트 레이어가 span 위치 계산에 쓰는 스케일 변수
          pageDiv.style.setProperty("--scale-factor", String(SCALE));
          pageDiv.style.setProperty("--total-scale-factor", String(SCALE));
          container.appendChild(pageDiv);

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          pageDiv.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;

          // 선택·복사되는 투명 텍스트 레이어
          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "textLayer";
          pageDiv.appendChild(textLayerDiv);
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const tl = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          await tl.render();
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
      // 워커·힙 자원 해제 (상주 앱 누수 방지)
      task?.destroy();
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
      {/* zoom 은 스크롤 컨테이너 내부 콘텐츠에만 적용 → 스크롤 정상 */}
      <div
        ref={containerRef}
        className="mx-auto flex w-fit flex-col items-center gap-5"
        style={{ zoom }}
      />
    </div>
  );
}
