import { useEffect, useState } from "react";
import init, { HwpDocument } from "@rhwp/core";
import { readBinary } from "./fs";

// WASM 은 한 번만 초기화
let wasmReady: Promise<unknown> | null = null;
function ensureWasm() {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

/** 한글 hwp/hwpx 뷰어 — rhwp(WASM)로 페이지를 SVG 렌더 */
export function HwpView({ path }: { path: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setPages(null);
    setErr(null);
    (async () => {
      try {
        await ensureWasm();
        const bytes = await readBinary(path);
        const doc = new HwpDocument(bytes);
        try {
          const n = doc.pageCount();
          for (let i = 0; i < n && !cancelled; i++) {
            const svg = doc.renderPageSvg(i);
            urls.push(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })));
            if (i % 2 === 1) {
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
          }
        } finally {
          // 오류·탭 전환 때도 WASM 힙 객체를 반드시 해제한다.
          doc.free();
        }
        if (!cancelled) setPages([...urls]);
      } catch (e) {
        if (!cancelled) {
          urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
          setErr((e as Error).message ?? String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [path]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        hwp 렌더 실패: {err}
      </div>
    );
  }
  if (!pages) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        한글 문서 렌더링 중…
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-bg-deep/50 p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {pages.map((url, i) => (
          <img
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            src={url}
            alt={`한글 문서 ${i + 1}쪽`}
            className="block w-full overflow-hidden rounded-md bg-paper shadow-sm ring-1 ring-line-soft"
          />
        ))}
      </div>
    </div>
  );
}
