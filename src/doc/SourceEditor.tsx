import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";

function langFor(path: string): Extension {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "json":
    case "jsonc":
      return json();
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript();
    case "ts":
    case "tsx":
      return javascript({ typescript: true });
    case "md":
    case "markdown":
      return markdown();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
      return css();
    case "py":
      return python();
    case "yml":
    case "yaml":
      return yaml();
    case "sql":
      return sql();
    case "rs":
      return rust();
    case "xml":
    case "svg":
      return xml();
    default:
      return [];
  }
}

// devkit 라이트 톤에 맞춘 최소 테마
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "13px" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--color-faint)",
  },
  ".cm-content": { padding: "1rem 0" },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "var(--color-bg-deep)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--color-accent-soft)",
  },
});

/** 소스·텍스트 편집기 (CodeMirror 6) — 찾기/바꾸기(Ctrl+F), 문법강조, 줄번호, undo */
export function SourceEditor({
  docKey,
  path,
  value,
  onChange,
  registerFlush,
}: {
  docKey: string; // 파일 바뀌면 리마운트
  path: string;
  value: string;
  onChange: (v: string) => void;
  registerFlush?: (get: () => string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const registerRef = useRef(registerFlush);
  registerRef.current = registerFlush;

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup, // 줄번호·undo·검색(Ctrl+F)·괄호매칭·문법강조
          keymap.of([indentWithTab]),
          langFor(path),
          theme,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const v = u.state.doc.toString();
            clearTimeout(timer);
            timer = setTimeout(() => onChangeRef.current(v), 250);
          }),
        ],
      }),
    });
    // 저장 시 디바운스 미반영분까지 flush 하도록 최신값 getter 등록
    registerRef.current?.(() => view.state.doc.toString());
    return () => {
      clearTimeout(timer);
      view.destroy();
    };
    // docKey 바뀌면 리마운트해 새 파일 로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  return <div ref={host} className="h-full" />;
}
