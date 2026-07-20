import { useEffect, useMemo, useRef, useState } from "react";
import { useDocs } from "./store";
import { usePrefs } from "../workspace/prefs";
import { basename } from "./types";

interface Item {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** 명령 팔레트 (Ctrl+K) — 빠른 파일 이동 + 명령 실행 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const {
    recentFiles,
    openDocs,
    openPaths,
    select,
    openFilesDialog,
    openFolderDialog,
  } = useDocs();
  const { theme, set } = usePrefs();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    const commands: Item[] = [
      {
        id: "cmd:openFile",
        label: "파일 열기",
        hint: "명령",
        run: () => {
          onClose();
          void openFilesDialog();
        },
      },
      {
        id: "cmd:openFolder",
        label: "폴더 열기",
        hint: "명령",
        run: () => {
          onClose();
          void openFolderDialog();
        },
      },
      {
        id: "cmd:settings",
        label: "설정 열기",
        hint: "명령",
        run: () => {
          onClose();
          window.dispatchEvent(new Event("devkit:open-settings"));
        },
      },
      {
        id: "cmd:theme",
        label: `테마 전환 (현재: ${theme})`,
        hint: "명령",
        run: () =>
          set(
            "theme",
            theme === "dark" ? "light" : theme === "light" ? "system" : "dark",
          ),
      },
    ];
    const tabs: Item[] = openDocs.map((d) => ({
      id: "tab:" + d.path,
      label: d.name,
      hint: "열린 탭",
      run: () => {
        onClose();
        select(d.path);
      },
    }));
    const recents: Item[] = recentFiles
      .filter((p) => !openDocs.some((d) => d.path === p))
      .map((p) => ({
        id: "recent:" + p,
        label: basename(p),
        hint: "최근",
        run: () => {
          onClose();
          void openPaths([p]);
        },
      }));
    return [...commands, ...tabs, ...recents];
  }, [
    theme,
    openDocs,
    recentFiles,
    onClose,
    openFilesDialog,
    openFolderDialog,
    openPaths,
    select,
    set,
  ]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.label.toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current
      ?.querySelectorAll<HTMLElement>("button")
      [idx]?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[idx]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-soft bg-bg shadow-xl"
      >
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="파일·명령 검색…"
          aria-label="명령 검색"
          className="border-b border-line-soft bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-faint"
        />
        <ul ref={listRef} className="flex flex-col overflow-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-faint">결과가 없어요.</li>
          )}
          {filtered.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={it.run}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] ${
                  i === idx ? "bg-surface text-fg" : "text-text"
                }`}
              >
                <span className="truncate">{it.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  {it.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
