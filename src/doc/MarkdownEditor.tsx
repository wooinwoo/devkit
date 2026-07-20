import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

function Inner({
  defaultValue,
  onReady,
  onChange,
}: {
  defaultValue: string;
  onReady: (crepe: Crepe) => void | (() => void);
  onChange: (md: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      clearTimeout(focusTimerRef.current);
      cleanupRef.current?.();
    },
    [],
  );
  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue,
      // 가상 커서(prosemirror-virtual-cursor)는 네이티브 캐럿을 caret-color:transparent로
      // 숨기고 JS로 그리는데, 컨텐츠 zoom 과 겹치면 좌표가 어긋나 커서가 사라진다.
      // → 가상 커서 끄고 네이티브 캐럿 사용 (zoom 반영됨)
      featureConfigs: { [Crepe.Feature.Cursor]: { virtual: false } },
    });
    // 매 키 입력마다 store 갱신·리렌더하면 렉 → 디바운스
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onChange(md), 250);
      });
    });
    cleanupRef.current = onReady(crepe) ?? undefined;
    // 문서 열자마자 캐럿이 보이도록 포커스 (생성 완료 후, DOM 기반이라 ctx 불필요)
    focusTimerRef.current = setTimeout(() => {
      (root.querySelector(".ProseMirror") as HTMLElement | null)?.focus();
    }, 80);
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
  onReady: (crepe: Crepe) => void | (() => void);
  onChange: (md: string) => void;
}) {
  return (
    <MilkdownProvider key={docKey}>
      <Inner defaultValue={defaultValue} onReady={onReady} onChange={onChange} />
    </MilkdownProvider>
  );
}
