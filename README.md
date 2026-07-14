# devkit

마크다운(.md)과 HTML 파일을 **열어서 렌더링**하는 데스크톱 문서 뷰어.
Tauri 2 로 패키징한 오프라인 앱.

## 하는 일

- **파일 열기 / 폴더 열기** — 여러 파일을 탭으로, 폴더는 사이드바 트리로
- **마크다운 렌더** — GFM(표·체크박스·취소선·자동링크) + 코드 하이라이트
- **HTML 렌더** — 샌드박스 iframe (스크립트 실행은 옵션)
- **편집 + 저장** — 보기/편집 토글, 소스↔라이브 프리뷰 split, Ctrl/Cmd+S 저장
- **OS 파일 연결** — `.md`/`.html` 을 더블클릭하면 devkit 으로 열림
  (이미 떠 있으면 새 창 대신 기존 창의 탭으로 추가 — single instance)

## 스택

Tauri 2 (Rust 셸) · React 19 · TypeScript · Vite · Tailwind CSS 4 ·
react-markdown + remark-gfm + rehype-highlight. 백엔드·네트워크 없음.

파일 읽기/쓰기/폴더 순회는 Rust 커맨드로 처리해 파일연결로 온 임의 경로도
권한 스코프 제약 없이 다룹니다.

## 개발

```bash
npm install
npm run dev            # 웹 프리뷰 (Tauri API 는 데스크톱에서만)
npm run tauri dev      # 데스크톱 앱 개발 모드
npm run tauri build    # 실행파일 빌드
```

## 배포

태그(`v*`)를 push 하면 GitHub Actions 가 Windows/macOS/Linux 인스톨러를
빌드해 Release 에 올립니다. Windows 는 커스텀 NSIS 인스톨러(브랜드 배너,
한/영 언어 선택, 파일 연결 등록).
