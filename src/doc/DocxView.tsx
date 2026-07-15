import { useEffect, useRef, useState } from "react";
import { readBinary } from "./fs";

/** Word docx 뷰어 — docx-preview 로 서식 포함 렌더 (읽기 전용).
 *  레거시 .doc(OLE)는 지원 불가라 별도 안내. */
export function DocxView({ path }: { path: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const bytes = await readBinary(path);
        const { renderAsync } = await import("docx-preview");
        const container = ref.current;
        if (cancelled || !container) return;
        container.replaceChildren();
        await renderAsync(bytes, container, undefined, {
          className: "docx", // 스타일 스코핑 (앱 CSS 오염 방지)
          inWrapper: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
        });
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
    <div className="docx-view h-full overflow-auto bg-bg-deep/50 p-6">
      {err && (
        <p className="text-center text-sm text-rose">
          docx 열기 실패: {err}
        </p>
      )}
      {loading && !err && (
        <p className="text-center text-sm text-faint">문서 렌더링 중…</p>
      )}
      {/* docx-preview 가 페이지(.docx-wrapper)를 생성해 채운다 */}
      <div ref={ref} className="mx-auto w-fit" />
    </div>
  );
}
