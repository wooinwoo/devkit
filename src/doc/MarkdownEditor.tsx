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
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => onChange(md));
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
