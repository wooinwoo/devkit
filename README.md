# devkit

로컬 문서를 **한 창에서** 보는 데스크톱 뷰어/에디터. Tauri 2, 오프라인.

## 지원 포맷

- **마크다운** — Typora식 seamless WYSIWYG(Milkdown), 편집·저장
- **PDF** — pdf.js 렌더
- **엑셀** (xlsx·xls) — SheetJS, 시트별 표
- **PowerPoint** (pptx·ppt) — pptx-preview 슬라이드
- **한글** (hwp·hwpx) — rhwp(WASM) SVG 렌더
- **이미지** (png·jpg·gif·webp·svg), **영상** (mp4·webm)
- **HTML** — 샌드박스 iframe, **텍스트/코드** (txt·json·csv·js·ts…)

## 기능

- 파일/폴더 열기 → 탭 + 사이드바 트리, **폴더 새로고침**
- **최근 파일** (껐다 켜도 유지)
- 아웃라인(목차) 사이드바, 사이드바 접기/드래그 폭조절
- 확대/축소(Ctrl +/-/0), 집중 모드(F8)
- OS 파일 연결(.md/.html/.hwp 더블클릭 → devkit), single instance

## 개발 / 배포

```bash
npm install
npm run tauri dev
npm run tauri build   # 또는 태그 push → GitHub Actions 가 3 OS 인스톨러 빌드
```

## 한계 (정직)

hwp·pptx·xlsx 는 오픈소스 렌더러 기반이라 복잡한 서식·차트는 원본과 다를 수
있습니다(레이아웃 근사). 데이터·기본 서식 확인 용도.
