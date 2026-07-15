import { useEffect, useState } from "react";

type Phase =
  | { k: "idle" }
  | { k: "available"; version: string }
  | { k: "downloading"; pct: number }
  | { k: "ready" }
  | { k: "error"; msg: string };

/** 자동 업데이트 배너 — 시작 시 새 버전 확인, 원클릭 다운로드·설치·재시작.
 *  업데이터 미설정/오프라인이면 조용히 사라진다(방해 없음). */
export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [dismissed, setDismissed] = useState(false);
  // 업데이트 객체(플러그인 타입)는 런타임에만 존재 → any 보관
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [update, setUpdate] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        if (!cancelled && u) {
          setUpdate(u);
          setPhase({ k: "available", version: u.version });
        }
      } catch {
        /* 미설정·오프라인 등은 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function install() {
    if (!update) return;
    try {
      let total = 0;
      let done = 0;
      setPhase({ k: "downloading", pct: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.downloadAndInstall((e: any) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        else if (e.event === "Progress") {
          done += e.data?.chunkLength ?? 0;
          setPhase({
            k: "downloading",
            pct: total ? Math.round((done / total) * 100) : 0,
          });
        } else if (e.event === "Finished") setPhase({ k: "ready" });
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setPhase({ k: "error", msg: (e as Error).message });
    }
  }

  if (phase.k === "idle" || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent-soft px-4 py-1.5 font-mono text-xs text-accent">
      {phase.k === "available" && (
        <>
          <span>새 버전 v{phase.version} 이 나왔어요.</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-full bg-accent px-3 py-0.5 font-semibold text-white transition-opacity hover:opacity-90"
            >
              지금 업데이트
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-accent/70 hover:text-accent"
              aria-label="나중에"
            >
              나중에
            </button>
          </span>
        </>
      )}
      {phase.k === "downloading" && <span>업데이트 내려받는 중… {phase.pct}%</span>}
      {phase.k === "ready" && <span>설치 완료. 곧 재시작합니다…</span>}
      {phase.k === "error" && (
        <span className="text-rose">업데이트 실패: {phase.msg}</span>
      )}
    </div>
  );
}
