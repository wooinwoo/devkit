import { useDocs } from "./store";

export function EmptyState() {
  const { openFilesDialog, openFolderDialog } = useDocs();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        devkit — document viewer
      </p>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-fg">
        문서를 열어보세요
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        마크다운(.md)과 HTML 파일을 열어서 렌더링해 봅니다. 여러 개를 탭으로
        띄우고, 폴더째 열어 사이드바에서 넘겨볼 수 있어요.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={openFilesDialog}
          className="rounded-full bg-fg px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-accent hover:text-white"
        >
          파일 열기
        </button>
        <button
          type="button"
          onClick={openFolderDialog}
          className="rounded-full border border-line-strong px-6 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-fg"
        >
          폴더 열기
        </button>
      </div>
      <p className="mt-6 font-mono text-[11px] text-faint">
        .md / .html 파일을 더블클릭해도 여기서 열립니다
      </p>
    </div>
  );
}
