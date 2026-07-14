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
    setPages(null);
    setErr(null);
    (async () => {
      try {
        await ensureWasm();
        const bytes = await readBinary(path);
        const doc = new HwpDocument(bytes);
        const n = doc.pageCount();
        const svgs: string[] = [];
        for (let i = 0; i < n; i++) svgs.push(doc.renderPageSvg(i));
        if (!cancelled) setPages(svgs);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
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
        {pages.map((svg, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line-soft"
            // rhwp 가 로컬 파싱해 생성한 SVG (신뢰 소스)
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ))}
      </div>
    </div>
  );
}
