# devkit

로컬 문서를 **한 창에서** 보고 편집하는 데스크톱 앱. 마크다운·Word·PDF·엑셀·PPT·한글·주피터 노트북까지 한 곳에서 열립니다. Tauri 2 기반, 오프라인 동작, 자동 업데이트.

<p>
  <img alt="version" src="https://img.shields.io/github/v/release/wooinwoo/devkit">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-informational">
</p>

## 설치

[**최신 릴리스에서 받기**](https://github.com/wooinwoo/devkit/releases/latest)

| OS | 파일 |
|----|------|
| Windows | `devkit_x.y.z_x64-setup.exe` |
| macOS (Apple Silicon) | `devkit_x.y.z_aarch64.dmg` |
| Linux | `.AppImage` · `.deb` · `.rpm` |

> 서명 안 된 앱이라 Windows SmartScreen이 뜨면 **추가 정보 → 실행**, macOS는 우클릭 → 열기.
> 한 번 설치하면 이후 새 버전은 **앱 안에서 자동 업데이트**됩니다 (아래 참고).

## 지원 포맷

| 종류 | 확장자 | 렌더 |
|------|--------|------|
| 마크다운 | `md` `markdown` | Typora식 seamless WYSIWYG (Milkdown Crepe), 편집·저장 |
| Word | `docx` | docx-preview, 서식·표·이미지 포함 |
| 한글 | `hwp` `hwpx` | rhwp (WASM) SVG 렌더 |
| PDF | `pdf` | pdf.js, **텍스트 선택·복사** |
| 스프레드시트 | `xlsx` `xls` `csv` `tsv` | 그리드, 셀 선택·복사, **단순 xlsx 값 편집/저장**, UTF-8·EUC-KR 감지 |
| PowerPoint | `pptx` | pptx-preview 슬라이드 |
| 주피터 노트북 | `ipynb` | 마크다운·코드 셀 + 출력(이미지·에러 포함) |
| 이미지 | `png` `jpg` `gif` `webp` `svg` … | **확대·팬·회전·맞춤** |
| 영상 | `mp4` `webm` `mov` … | 재생 |
| HTML | `html` `htm` | 스크립트를 실행하지 않는 샌드박스 iframe |
| 텍스트·코드 | `txt` `json` `yaml` `js` `ts` `py` `rs` `sql` … | CodeMirror 6, 문법 강조, 찾기·바꾸기 |

### 편집 가능 범위

| 확장자 | 현재 상태 |
|--------|-----------|
| `md` `markdown` `html` `htm` 및 텍스트·코드 | 편집·저장 가능 |
| `xlsx` | 셀 값 편집·저장 가능 (Excel에서 만든 파일 포함) |
| `csv` `tsv` | 셀 값 편집·저장 가능 |
| `docx` `hwp` `hwpx` `pdf` `pptx` `ipynb` 이미지·영상 | 현재 읽기 전용 |
| `xls` | 현재 읽기 전용 (되쓸 수 없는 옛 바이너리 형식) |

xlsx는 통합문서를 다시 만들지 않고 **원본 파일에서 편집한 셀이 든 시트만 고쳐 씁니다.** 서식, 수식, 차트, 피벗, 조건부 서식처럼 devkit이 다루지 않는 요소는 원본 그대로 남습니다. 다만 다음 셀은 값을 덮어쓰면 원본이 깨질 수 있어 편집을 막습니다.

- 수식이 들어 있는 셀 (참조하는 다른 셀은 편집 가능)
- 병합된 범위에서 왼쪽 위가 아닌 셀
- 시트 보호가 걸린 시트

CSV·TSV는 서식이 없어 전체를 다시 씁니다. 줄바꿈과 BOM은 원본을 따라가지만, EUC-KR 파일은 저장 시 UTF-8로 바뀝니다 (그리드 하단에 안내가 뜹니다).

## 주요 기능

### 뷰잉

- 파일/폴더 열기 → 탭 + 사이드바 트리 (실제 폴더 구조 그대로)
- 파일 검색·필터, 최근 파일, **세션 복원**(지난 폴더·탭 복원)
- 창에 **드래그앤드롭**으로 열기
- 컨텐츠 전용 확대/축소 (Ctrl/⌘ +/-, Ctrl/⌘+마우스휠)
- 다크 / 라이트 / 시스템 테마
- 아웃라인(목차), 사이드바 접기·드래그 폭조절, 집중 모드

### 편집

- 마크다운 seamless WYSIWYG + 소스 모드 전환, 본문 폭 조절
- 코드/텍스트: **찾기·바꾸기(Ctrl+F)**, 문법 강조, 줄번호, 안정적 undo
- 엑셀(xlsx): 앱에서 만든 단순 통합문서의 셀 값 편집, 표 붙여넣기, 범위 복사·삭제, 수동 저장
- 빈 폴더에서도 상단의 새 파일로 `.xlsx` 통합문서 생성
- 텍스트 **자동 저장** (설정에서 토글)

### 파일 관리 (우클릭 컨텍스트 메뉴)

- 이름 변경, 삭제(휴지통), 새 파일·폴더
- 탐색기에서 보기, 경로 복사, 기본 앱으로 열기

### 기타

- **명령 팔레트** (Ctrl+K), 빠른 파일 이동 + 명령 실행
- 설정 패널 (Ctrl+,)
- OS 파일 연결 (더블클릭 → devkit), single instance
- **자동 업데이트**, 시작 시 새 버전 확인 후 원클릭 갱신

## 단축키

| 동작 | 키 |
|------|----|
| 파일 열기 / 저장 | Ctrl/⌘+O / Ctrl/⌘+S |
| 명령 팔레트 | Ctrl/⌘+K |
| 찾기 (소스·코드) | Ctrl/⌘+F |
| 탭 닫기 / 전환 / 선택 | Ctrl/⌘+W / Ctrl/⌘+Tab / Ctrl/⌘+1~9 |
| 확대·축소 | Ctrl/⌘+± · Ctrl/⌘+마우스휠 |
| 사이드바 접기 / 집중 모드 | Ctrl/⌘+B / F8 |
| 설정 | Ctrl/⌘+, |

## 자동 업데이트

설치본은 GitHub Releases의 서명된 `latest.json`을 확인해 새 버전을 자동으로 받습니다. 릴리스 서명에는 CI 시크릿 `TAURI_SIGNING_PRIVATE_KEY`가 필요합니다.

`main` 브랜치에 코드를 push하는 것만으로 설치된 앱은 바뀌지 않습니다. 버전을 올리고 `vX.Y.Z` 태그를 push해 GitHub Release가 공개된 뒤에 설치본과 자동 업데이트에 반영됩니다.

## 기술 스택

Tauri 2 (Rust) · React 19 · TypeScript · Vite 7 · Tailwind CSS 4

Milkdown Crepe · CodeMirror 6 · pdf.js · SheetJS · docx-preview · pptx-preview · rhwp(WASM)

## 개발 / 빌드

```bash
npm install
npm test               # xlsx 왕복 저장 + 비신뢰 문서 안전 검사
npm run tauri dev      # 개발 (핫리로드)
npm run tauri build    # 로컬 빌드 (현재 OS용)
```

릴리스는 버전 태그를 push 하면 GitHub Actions가 Windows·macOS·Linux 인스톨러를 빌드하고 서명합니다.

```bash
git tag v0.0.0 && git push origin v0.0.0
```

> Windows 인스톨러는 리눅스/WSL에서 못 만듭니다. 태그를 push 하면 CI(Windows 러너)가 빌드합니다.

## 로드맵 (남은 것)

- [ ] 이미지 붙여넣기 → 로컬 assets 저장
- [ ] 대용량 파일 가상화 (PDF·엑셀·로그)
- [ ] 일반 Excel 파일의 원본 OOXML을 보존하는 편집 (서식·수식·차트)
- [ ] 코드 서명 (SmartScreen·Gatekeeper 제거, 유료 인증서 필요)

### 한계

hwp·pptx·xlsx는 오픈소스 렌더러 기반이라 복잡한 레이아웃은 원본과 다를 수 있습니다. xlsx는 원본 손실을 막기 위해 앱에서 새로 만든 단순 통합문서의 값만 편집합니다. 일반 Excel 파일과 서식·수식·차트가 있는 xlsx, `xls` `csv` `tsv`는 읽기 전용입니다. 수식 입력과 실행 취소는 아직 지원하지 않습니다.

---

by [wooinwoo](https://github.com/wooinwoo)
