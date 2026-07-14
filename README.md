# devkit

로컬 개발자 유틸리티 **데스크톱 앱**. 자주 쓰는 작은 도구를 한 창에 모았습니다.
Tauri 2 로 패키징한 네이티브 앱이라 브라우저·인터넷 없이 오프라인으로 돕니다.

## 도구

### Cron
크론 표현식을 사람의 말과 다음 실행 시각으로 풀어줍니다.
`0 9 * * 1-5` → **평일(월~금) 09시 00분** + 다음 실행 5회.
파서는 라이브러리 없이 직접 구현 (`src/cron.ts`, `src/describe.ts`).

### HTML viewer
HTML 을 붙여넣으면 샌드박스 iframe 에 라이브 렌더링. 뷰포트 토글
(Full / Tablet / Mobile), 스크립트 실행 on/off, 요소 수 통계.

## 스택

Tauri 2 (Rust 셸) · React 19 · TypeScript · Vite · Tailwind CSS 4.
프론트는 순수 클라이언트, 백엔드·네트워크 의존성 없음.

## 개발

```bash
npm install
npm run dev            # 웹 프리뷰 (http://localhost:5173)
npm run tauri dev      # 데스크톱 앱 개발 모드
npm run tauri build    # 실행파일 빌드 (.AppImage / .deb 등)
```

## 배포

`npm run tauri build` 산출물은 `src-tauri/target/release/bundle/` 아래에
생깁니다. GitHub Releases 에 올려 배포합니다. 새 도구는 `src/tools/` 에
컴포넌트를 추가하고 `App.tsx` 사이드바에 등록하면 됩니다.
