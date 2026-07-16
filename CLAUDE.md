# devkit — Claude Code 프로젝트 메모리

이 프로젝트의 작업 규칙·아키텍처·릴리스·함정은 정본 문서를 따른다.

@AGENTS.md

## Claude Code 작업 시 추가 사항

- 코드 변경 후 **검증 명령 한 줄** 보여주기 (`npm run build`, `cargo check`).
- 커밋은 **Conventional Commits + 한국어**. 사람 이름·`Co-Authored-By` 트레일러 금지.
- 임시 파일은 스크래치패드에. `public/samples/` 에 만든 테스트 샘플은 릴리스 전 삭제.
- 프론트 변경은 `npm run dev` + Playwright 로 실제 렌더 검증 (스크린샷·DOM 확인).
  - 브라우저 테스트 전 `localStorage.removeItem('devkit.session.v1')` (세션 복원 방해 제거).
  - `?open=/samples/x` DEV 훅으로 파일 오픈.
- `pkill -f vite` 는 exit 144 라 `&&` 체인에서 분리해 실행.
- Windows `.exe` 는 로컬에서 못 만든다 → 태그 push 로 CI 빌드. 실행 결과는 `gh run watch` / `gh release view` 로 확인.
- 자동 업데이트 서명 시크릿(`TAURI_SIGNING_PRIVATE_KEY`)은 사용자만 등록 가능. `createUpdaterArtifacts` 는 시크릿 확인 후 켤 것 (없으면 CI 실패).
