import { useEffect } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

/** 우클릭 컨텍스트 메뉴 — 화면 좌표에 표시, 바깥 클릭/Esc 로 닫힘 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 다음 틱부터 (여는 클릭이 바로 닫지 않게)
    const t = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <ul
      role="menu"
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-line-soft bg-bg py-1 shadow-xl"
    >
      {items.map((it, i) =>
        it.label === "-" ? (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="my-1 border-t border-line-soft" />
        ) : (
          <li key={it.label} role="menuitem">
            <button
              type="button"
              onClick={() => {
                onClose();
                it.run();
              }}
              className={`w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-surface ${
                it.danger ? "text-rose" : "text-text"
              }`}
            >
              {it.label}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
