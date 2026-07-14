import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

function Inner({
  defaultValue,
  onReady,
  onChange,
}: {
  defaultValue: string;
  onReady: (crepe: Crepe) => void;
  onChange: (md: string) => void;
}) {
  useEditor((root) => {
    const crepe = new Crepe({ root, defaultValue });
    // 매 키 입력마다 store 갱신·리렌더하면 렉 → 디바운스
    let timer: ReturnType<typeof setTimeout> | undefined;
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        clearTimeout(timer);
        timer = setTimeout(() => onChange(md), 250);
      });
    });
    onReady(crepe);
    return crepe;
  }, []);
  return <Milkdown />;
}

/** Typora 식 seamless WYSIWYG 마크다운 에디터 (Milkdown Crepe). */
export function MarkdownEditor({
  docKey,
  defaultValue,
  onReady,
  onChange,
}: {
  docKey: string; // 파일 바뀌면 리마운트
  defaultValue: string;
  onReady: (crepe: Crepe) => void;
  onChange: (md: string) => void;
}) {
  return (
    <MilkdownProvider key={docKey}>
      <Inner defaultValue={defaultValue} onReady={onReady} onChange={onChange} />
    </MilkdownProvider>
  );
}
