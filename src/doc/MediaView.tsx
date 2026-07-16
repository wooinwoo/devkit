import { useCallback, useEffect, useRef, useState } from "react";
import { mediaSrc } from "./fs";

function useMediaSrc(path: string): string {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    mediaSrc(path).then((s) => {
      if (!cancelled) setSrc(s);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return src;
}

const MIN = 0.1;
const MAX = 16;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/** 이미지 뷰어 — 커서 기준 확대(휠), 드래그 팬, 회전, 맞춤↔100% */
export function ImageView({ path }: { path: string }) {
  const src = useMediaSrc(path);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [fitted, setFitted] = useState(true); // true면 창에 맞춤
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );

  // 파일 바뀌면 초기화
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
    setRot(0);
    setFitted(true);
  }, [path]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const box = boxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      // 박스 중심 기준 좌표
      const ox = cx - r.left - r.width / 2;
      const oy = cy - r.top - r.height / 2;
      setFitted(false);
      setScale((s) => {
        const ns = clamp(s * factor);
        const k = ns / s;
        // 커서 아래 지점이 고정되도록 위치 보정
        setPos((p) => ({ x: ox - (ox - p.x) * k, y: oy - (oy - p.y) * k }));
        return ns;
      });
    },
    [],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Ctrl 없이도 이미지 뷰어에선 휠=줌 (사진 뷰어 관례)
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    },
    [zoomAt],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (fitted && scale === 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
    setFitted(true);
  };
  const actual = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
    setFitted(false);
  };

  const moving = !fitted && scale !== 1;

  return (
    <div className="relative flex h-full flex-col bg-bg-deep/40">
      {/* 컨트롤 */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-line-soft bg-bg/90 px-1.5 py-1 font-mono text-xs text-muted shadow-sm backdrop-blur">
        <button type="button" onClick={() => zoomAt(1 / 1.25, innerCenter(boxRef).x, innerCenter(boxRef).y)} className="px-1.5 hover:text-fg" aria-label="축소">−</button>
        <span className="w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomAt(1.25, innerCenter(boxRef).x, innerCenter(boxRef).y)} className="px-1.5 hover:text-fg" aria-label="확대">+</button>
        <span className="mx-1 h-3.5 w-px bg-line-soft" />
        <button type="button" onClick={reset} className="px-1.5 hover:text-fg" title="창에 맞춤">맞춤</button>
        <button type="button" onClick={actual} className="px-1.5 hover:text-fg" title="실제 크기">100%</button>
        <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} className="px-1.5 hover:text-fg" title="회전" aria-label="회전">⟳</button>
      </div>

      <div
        ref={boxRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => (fitted ? actual() : reset())}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
        style={{ cursor: moving ? (drag.current ? "grabbing" : "grab") : "default" }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt={path.split(/[\\/]/).pop() ?? "이미지"}
            draggable={false}
            className={fitted ? "max-h-full max-w-full object-contain" : "max-w-none"}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale}) rotate(${rot}deg)`,
              transformOrigin: "center",
            }}
          />
        )}
      </div>
    </div>
  );
}

// 컨트롤 버튼 줌의 기준점 = 박스 중심
function innerCenter(ref: React.RefObject<HTMLDivElement | null>) {
  const r = ref.current?.getBoundingClientRect();
  if (!r) return { x: 0, y: 0 };
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 영상 뷰어 — webview 코덱 범위 내 재생 (H.264 mp4·webm 등) */
export function VideoView({ path }: { path: string }) {
  const src = useMediaSrc(path);
  return (
    <div className="flex h-full items-center justify-center bg-black/90 p-4">
      {src && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={src} controls className="max-h-full max-w-full rounded-lg" />
      )}
    </div>
  );
}
