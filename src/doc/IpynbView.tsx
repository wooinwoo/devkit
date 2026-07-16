import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { readDoc } from "./fs";

interface Cell {
  cell_type: string;
  source: string | string[];
  outputs?: Output[];
  execution_count?: number | null;
}
interface Output {
  output_type: string;
  text?: string | string[];
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}
interface Notebook {
  cells: Cell[];
  metadata?: { language_info?: { name?: string } };
}

const src = (s: string | string[]) => (Array.isArray(s) ? s.join("") : s ?? "");

function CodeCell({ code, lang, n }: { code: string; lang: string; n?: number | null }) {
  let html = "";
  try {
    html = hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang }).value
      : hljs.highlightAuto(code).value;
  } catch {
    html = code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  }
  return (
    <div className="flex gap-2">
      <span className="shrink-0 select-none pt-3 text-right font-mono text-[11px] text-faint" style={{ width: "3rem" }}>
        [{n ?? " "}]
      </span>
      <pre className="hljs min-w-0 flex-1 overflow-x-auto rounded-md border border-line-soft p-3 text-[12.5px] leading-relaxed">
        {/* highlight.js 로 하이라이트한 코드 (로컬 파싱, 신뢰 소스) */}
        {/* eslint-disable-next-line react/no-danger */}
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function OutputView({ out }: { out: Output }) {
  if (out.output_type === "stream") {
    return <pre className="whitespace-pre-wrap px-3 text-[12.5px] text-muted">{src(out.text ?? "")}</pre>;
  }
  if (out.output_type === "error") {
    // ANSI 코드 제거
    const tb = (out.traceback ?? []).join("\n").replace(/\[[0-9;]*m/g, "");
    return <pre className="whitespace-pre-wrap px-3 text-[12px] text-rose">{tb || `${out.ename}: ${out.evalue}`}</pre>;
  }
  // execute_result / display_data
  const data = out.data ?? {};
  const png = data["image/png"] as string | undefined;
  if (png) {
    return (
      <div className="px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${png}`} alt="출력 이미지" className="max-w-full rounded" />
      </div>
    );
  }
  const htmlOut = data["text/html"] as string | string[] | undefined;
  if (htmlOut) {
    return (
      <div
        className="px-3 text-[12.5px]"
        // 노트북 셀 출력 HTML (로컬 파일, 신뢰 소스)
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: src(htmlOut) }}
      />
    );
  }
  const text = data["text/plain"] as string | string[] | undefined;
  if (text) {
    return <pre className="whitespace-pre-wrap px-3 text-[12.5px] text-text">{src(text)}</pre>;
  }
  return null;
}

/** 주피터 노트북(.ipynb) 뷰어 — 마크다운·코드 셀 + 출력 렌더 (읽기 전용) */
export function IpynbView({ path }: { path: string }) {
  const [nb, setNb] = useState<Notebook | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNb(null);
    setErr(null);
    (async () => {
      try {
        const text = await readDoc(path);
        const parsed = JSON.parse(text) as Notebook;
        if (!cancelled) setNb(parsed);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (err)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        노트북 열기 실패: {err}
      </div>
    );
  if (!nb)
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        불러오는 중…
      </div>
    );

  const lang = nb.metadata?.language_info?.name ?? "python";

  return (
    <div className="h-full overflow-auto bg-bg-deep/40 p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {nb.cells.map((cell, i) => (
          // 셀 순서 고정
          // eslint-disable-next-line react/no-array-index-key
          <div key={i}>
            {cell.cell_type === "markdown" ? (
              <div className="ipynb-md text-[14px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {src(cell.source)}
                </ReactMarkdown>
              </div>
            ) : cell.cell_type === "code" ? (
              <div className="flex flex-col gap-1.5">
                <CodeCell code={src(cell.source)} lang={lang} n={cell.execution_count} />
                {(cell.outputs ?? []).map((o, j) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <OutputView key={j} out={o} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
