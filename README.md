# devkit

Typora 스타일 **마크다운 에디터** 데스크톱 앱. 입력하는 자리에서 바로 서식이
되는 seamless WYSIWYG. Tauri 2 로 패키징한 오프라인 앱.

## 기능

- **seamless 라이브 편집** — 소스/프리뷰 분리 없이 입력 자리에서 즉시 서식
  (Milkdown Crepe, GFM 표·체크박스·코드 하이라이트)
- **문서 / 소스 토글** — 원문 마크다운 편집도 가능, Ctrl/Cmd+S 저장
- **파일 / 폴더 열기** — 여러 파일 탭 + 폴더 트리
- **아웃라인(목차) 사이드바** — 제목 구조로 점프, 파일↔목차 탭 전환
- **사이드바 접기 / 드래그 폭 조절** (Ctrl+B)
- **확대 / 축소** — Ctrl +/−/0, 상태바에 배율 표시
- **집중 모드** — 크롬 숨김 (F8)
- **OS 파일 연결** — `.md`/`.html` 더블클릭 → devkit (single instance)

## 스택

Tauri 2 (Rust 셸) · React 19 · TypeScript · Vite · Tailwind 4 ·
Milkdown Crepe(ProseMirror+remark). 파일 IO 는 Rust 커맨드.

## 개발

```bash
npm install
npm run tauri dev      # 데스크톱 앱
npm run tauri build    # 실행파일
```

## 배포

태그(`v*`) push → GitHub Actions 가 Windows(NSIS)/macOS/Linux 인스톨러 빌드.
