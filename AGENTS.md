# devkit 작업 가이드 (AGENTS)

로컬 문서 뷰어/에디터 데스크톱 앱. Tauri 2 (Rust) + React 19 + TypeScript + Vite 7 + Tailwind CSS 4. 오프라인 동작, GitHub Releases 자동 업데이트.

이 문서는 코드 작업 시 지켜야 할 규칙·구조·함정을 정리한다. 사람/AI 에이전트 공통.

## 빠른 시작

```bash
npm install
npm run tauri dev      # 개발 (핫리로드, Tauri 셸)
npm run dev            # 웹만 (브라우저 검증용, Tauri API 는 fetch 폴백)
```

## 검증 (커밋 전 필수)

코드 변경 후 반드시 둘 다 통과:

```bash
npm run build                    # tsc -b + vite (타입체크 포함)
cd src-tauri && cargo check      # Rust 컴파일
```

프론트 기능은 브라우저 + Playwright 로 실제 검증한다 (아래 "테스트" 참고).

## 아키텍처 (핵심 파일)

### 상태

- `src/doc/store.tsx` — `DocProvider`. 열림/저장/닫기/세션/자동저장 리듀서. 탭·활성문서. `registerEditor(path, getLatest)` 로 에디터 최신값 flush.
- `src/workspace/prefs.tsx` — `WorkspaceProvider`. UI 설정(theme·zoom·docWidth·collapsedDirs·autosave·sidebar), localStorage 영속, theme 를 `<html data-theme>` 에 반영. **DocProvider 는 WorkspaceProvider 안에 있어 `usePrefs()` 사용 가능.**

### 라우팅·뷰어

- `src/doc/types.ts` — `DocKind`, `kindOf(path)`, `ALL_EXTS`, `isTextKind`. **새 포맷 추가 시 여기 + `lib.rs` doc_kind 둘 다 수정.**
- `src/doc/DocViewer.tsx` — `doc.kind` → 뷰어 라우팅. `ownsScroll`(자체 스크롤·확대: pdf/xlsx/image/source) 은 전역 zoom 래퍼 밖, 나머지(flow)는 스크롤+zoom 래퍼 안.
- `src/doc/xlsxModel.ts` — xlsx 값 패치·안전 판별·직렬화. 원본 서식 손실 가능성이 있으면 읽기 전용으로 막으며, 저장 gate를 우회하지 말 것.
- 뷰어: `MarkdownEditor`(Milkdown Crepe), `SourceEditor`(CodeMirror 6), `PdfView`(pdf.js + textLayer), `XlsxView`(SheetJS 그리드+셀선택), `DocxView`(docx-preview), `IpynbView`, `HwpView`(rhwp WASM), `PptxView`, `MediaView`(image/video), `HtmlView`.

### UI

- `src/App.tsx` — `Shell`. 전역 단축키, 드래그앤드롭, 파일연결 startup, 설정/팔레트 상태, `UpdateBanner`.
- `src/doc/FileTree.tsx` — 트리 + 검색 + 우클릭 컨텍스트 메뉴(파일 조작).
- `CommandPalette`(Ctrl+K), `SettingsPanel`(Ctrl+,), `ContextMenu`, `UpdateBanner`.

### 브리지 / Rust

- `src/doc/fs.ts` — Tauri `invoke` 래퍼 + 브라우저 `fetch` 폴백. `isTauri` 감지. 파일 조작(rename/create/delete/reveal) 래퍼.
- `src-tauri/src/lib.rs` — 커맨드(`list_docs` walk, read/write, rename/create/delete=trash, 파일연결 argv/Opened), 플러그인 등록. **커맨드 추가 시 `invoke_handler![]` 에도 등록.**
- `src-tauri/tauri.conf.json` — bundle, `plugins.updater`(pubkey·endpoints), `createUpdaterArtifacts`, `fileAssociations`.
- `src-tauri/capabilities/default.json` — 권한. 플러그인 추가 시 권한도 추가.

## 커밋 규칙

- **Conventional Commits + 한국어 description** (예: `feat: 다크모드 추가`).
- 커밋 메시지/PR 에 **사람 이름 금지**, **`Co-Authored-By` 트레일러 금지**.
- 도구는 절대경로 사용.

## 릴리스 (버전 올리기)

1. 버전 4곳 동기화: `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. `cd src-tauri && cargo check` 로 `Cargo.lock` 갱신.
3. 커밋 → `git push origin main`.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` → GitHub Actions 가 Windows·macOS·Linux 인스톨러 빌드 + **서명** + `latest.json` 업로드.

```bash
# 버전 일괄 변경 예
npm version 0.17.0 --no-git-tag-version
sed -i 's/"version": "0.16.0"/"version": "0.17.0"/' src-tauri/tauri.conf.json
sed -i 's/^version = "0.16.0"/version = "0.17.0"/' src-tauri/Cargo.toml
```

## 자동 업데이트 / 서명

- 설치본은 `plugins.updater.endpoints` 의 `latest.json` 을 확인해 자동 갱신. 시작 시 `UpdateBanner` 가 `check()`.
- CI 서명에 시크릿 **`TAURI_SIGNING_PRIVATE_KEY`** 필요. 개인키는 `~/.devkit_updater.key` (레포 밖, 절대 커밋 금지). 공개키는 `tauri.conf.json` 의 `plugins.updater.pubkey`.
- **함정**: `createUpdaterArtifacts: true` 인데 서명 시크릿 없으면 CI 빌드 실패. 시크릿 등록 확인 후 켤 것.

## 테스트 (프론트 검증)

- `npm run dev` + Playwright MCP 로 실제 렌더 확인.
- xlsx 편집 모델을 바꿨으면 `npm test` 왕복 저장 검사도 통과시킨다.
- `npm test` 는 IPYNB HTML sandbox, DOCX altChunk·링크, Tauri CSP 회귀도 확인한다.
- **`?open=/samples/x` 는 DEV 전용 훅**(App.tsx). 브라우저에서 `http://localhost:5173/?open=/samples/a.md` 로 파일 오픈. `fs.ts` 가 fetch 폴백.
- 임시 샘플은 `public/samples/` 에 만들고 **검증 후 삭제**(릴리스에 포함 금지).
- Tauri 전용(invoke: 폴더 스캔·파일 조작·자동저장 쓰기)은 브라우저에서 안 됨 → `cargo check` + 로직 리뷰로 검증, 실동작은 앱에서.

## 함정 (반복 실수 방지)

- **세션 복원**(`devkit.session.v1`)이 지난 탭을 다시 열어 브라우저 테스트를 방해한다. `?open=` 테스트 전에 `localStorage.removeItem('devkit.session.v1')`.
- **`pkill -f vite` 는 exit 144**(SIGTERM)라 `&&` 체인을 끊는다. pkill 은 단독 실행.
- **WSL/리눅스는 Windows 인스톨러를 못 만든다.** `.exe` 는 오직 CI(Windows 러너)에서 생성. 로컬 폴더에 `.exe` 없는 게 정상.
- **CSS `zoom` 컨텐츠 확대**: 스크롤 컨테이너 자체가 아니라 그 안의 컨텐츠에 zoom 적용해야 스크롤이 안 깨진다. 자체 스크롤 뷰어는 `ownsScroll` 로 zoom 래퍼 밖에 둔다.
- **마크다운 커서**: `featureConfigs: { [Crepe.Feature.Cursor]: { virtual: false } }`. 가상 커서 + CSS zoom 이면 캐럿이 사라진다.
- **저장 유실 방지**: 에디터는 `registerEditor(path, getLatest)` 등록, `save()` 가 그 최신값을 쓴다 (디바운스 옛 값으로 저장하는 유실 차단).
- **비신뢰 문서 격리**: IPYNB HTML은 빈 sandbox iframe, DOCX altChunk는 비활성화. `tauri.conf.json` CSP를 `null`로 되돌리지 말 것.
- **xlsx 편집 범위**: 앱이 만든 단순 통합문서만 값 편집. 일반 Excel 파일의 gate를 넓히면 SheetJS 재직렬화로 서식·수식·차트가 손실될 수 있다.
- **버전 표시**: 사이드바 푸터는 런타임 `getVersion()`(Tauri) + `__APP_VERSION__`(vite define, package.json) 폴백.
- **임시 파일**은 스크래치패드에. 레포에 남기지 말 것.

## 디자인 톤

- em dash(`—`) 금지, UI 이모지 금지, 다크 배경에 `#fff` 금지(톤다운).
- 카피는 한국어 자연 표현, 여백으로 그룹핑.
- 색은 CSS 변수/Tailwind 토큰. raw hex 금지.
