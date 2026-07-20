use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// cold start 때 넘어온 파일 경로 보관 (프론트가 아직 안 떠 있을 때 대비).
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

const IMG_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const VID_EXTS: &[&str] = &["mp4", "webm", "ogv", "mov", "m4v"];
const TXT_EXTS: &[&str] = &[
    "txt", "text", "log", "json", "jsonc", "yml", "yaml", "toml", "xml", "ini", "conf", "env", "js",
    "ts", "jsx", "tsx", "css", "scss", "py", "rs", "go", "java", "c", "cpp", "h", "sh", "sql",
];

fn ext_of(name: &str) -> String {
    name.rsplit('.').next().unwrap_or("").to_lowercase()
}

fn doc_kind(name: &str) -> Option<&'static str> {
    let e = ext_of(name);
    match e.as_str() {
        "md" | "markdown" => Some("markdown"),
        "html" | "htm" => Some("html"),
        "hwp" | "hwpx" => Some("hwp"),
        "docx" => Some("docx"),
        "ipynb" => Some("ipynb"),
        "pdf" => Some("pdf"),
        "xlsx" | "xls" | "csv" | "tsv" => Some("xlsx"),
        "pptx" => Some("pptx"),
        _ if IMG_EXTS.contains(&e.as_str()) => Some("image"),
        _ if VID_EXTS.contains(&e.as_str()) => Some("video"),
        _ if TXT_EXTS.contains(&e.as_str()) => Some("text"),
        _ => None,
    }
}

fn is_doc(name: &str) -> bool {
    doc_kind(name).is_some()
}

/// argv 에서 문서 파일 경로만 골라냄 (실행파일 경로·플래그 제외).
fn extract_file_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && is_doc(a))
        .cloned()
        .collect()
}

#[derive(serde::Serialize)]
struct TreeNode {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

const IGNORE_DIRS: &[&str] = &["node_modules", ".git", ".next", "dist", "target", ".vscode"];

/// 폴더를 재귀 순회해 실제 폴더 구조 그대로 트리 반환 (파일탐색기처럼 전부 표시).
/// 문서 형식은 kind 부여(열림), 그 외는 kind 없음(회색 표시만).
/// node_modules 등 무거운/빌드 폴더만 제외. scope 무관, Rust std::fs 로 직접.
fn walk(dir: &Path, depth: u32) -> Vec<TreeNode> {
    if depth > 8 {
        return vec![];
    }
    let mut dirs: Vec<TreeNode> = vec![];
    let mut files: Vec<TreeNode> = vec![];

    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let is_dir = path.is_dir();
        if is_dir {
            // 무거운/빌드 폴더만 제외, 나머지(숨김 포함)는 전부 표시
            if IGNORE_DIRS.contains(&name.as_str()) {
                continue;
            }
            let children = walk(&path, depth + 1);
            // 빈 폴더도 실제 폴더처럼 표시
            dirs.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                kind: None,
                children: Some(children),
            });
        } else {
            // 모든 파일 표시 — 문서면 kind, 아니면 None(못 여는 파일=회색)
            let kind = doc_kind(&name).map(|k| k.to_string());
            files.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                kind,
                children: None,
            });
        }
    }
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    files.sort_by(|a, b| a.name.cmp(&b.name));
    dirs.into_iter().chain(files).collect()
}

#[tauri::command]
fn list_docs(root: String) -> Vec<TreeNode> {
    walk(Path::new(&root), 0)
}

#[tauri::command]
fn is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
}

/// 같은 디렉터리에 완전히 쓴 뒤 교체해 실패 시 기존 원본을 보존한다.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if std::fs::symlink_metadata(path)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("심볼릭 링크 파일은 안전을 위해 저장하지 않아요".into());
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let permissions = std::fs::metadata(path).ok().map(|meta| meta.permissions());
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(bytes).map_err(|e| e.to_string())?;
    if let Some(permissions) = permissions {
        temp.as_file()
            .set_permissions(permissions)
            .map_err(|e| e.to_string())?;
    }
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.error.to_string())?;
    #[cfg(unix)]
    if let Ok(dir) = std::fs::File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}

/// 임의 절대경로 읽기 (파일연결로 온 경로도 scope 제약 없이).
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 원본 경로에 저장.
#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), content.as_bytes())
}

/// 바이너리 파일 바이트 읽기 (hwp 등 — 프론트에서 Uint8Array 로 처리).
#[tauri::command]
fn read_binary(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

fn percent_decode(input: &str) -> Result<String, String> {
    fn hex(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }
    let source = input.as_bytes();
    let mut output = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' {
            let high = source.get(index + 1).and_then(|byte| hex(*byte));
            let low = source.get(index + 2).and_then(|byte| hex(*byte));
            let (Some(high), Some(low)) = (high, low) else {
                return Err("바이너리 저장 경로가 올바르지 않아요".into());
            };
            output.push(high * 16 + low);
            index += 3;
        } else {
            output.push(source[index]);
            index += 1;
        }
    }
    String::from_utf8(output).map_err(|_| "바이너리 저장 경로가 올바르지 않아요".into())
}

/// 바이너리 저장. raw IPC body를 써서 대용량 number[] JSON 변환을 피한다.
#[tauri::command]
fn write_binary(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-devkit-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "바이너리 저장 경로가 없어요".to_string())?;
    let path = percent_decode(encoded_path)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("바이너리 저장 데이터가 올바르지 않아요".into());
    };
    atomic_write(Path::new(&path), bytes)
}

/// 파일·폴더 이름 변경/이동.
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("같은 이름이 이미 있어요".into());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// 빈 파일 생성.
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("이미 있는 파일이에요".into());
    }
    std::fs::write(&path, "").map_err(|e| e.to_string())
}

/// 새 바이너리 파일을 원자적으로 생성한다. 기존 파일은 절대 덮어쓰지 않는다.
#[tauri::command]
fn create_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&path);
    if path.exists() {
        return Err("이미 있는 파일이에요".into());
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(&bytes).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist_noclobber(path)
        .map_err(|e| e.error.to_string())?;
    Ok(())
}

/// 폴더 생성.
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// OS 휴지통으로 삭제 (영구삭제 아님 — 복구 가능).
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 프론트가 최초 실행 시 조회: cold start 로 넘어온 파일 경로.
#[tauri::command]
fn get_opened_files(app: tauri::AppHandle) -> Vec<String> {
    app.state::<OpenedFiles>().0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // single-instance 는 반드시 첫 플러그인 (desktop 전용).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
            let paths = extract_file_args(&argv);
            if !paths.is_empty() {
                let _ = app.emit("opened-files", paths);
            }
        }));
        // 창 크기·위치 기억 (종료 시 저장, 실행 시 복원)
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
        // 자동 업데이트 (GitHub Releases latest.json) + 재시작
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        builder = builder.plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OpenedFiles::default())
        .invoke_handler(tauri::generate_handler![
            list_docs,
            is_dir,
            read_file,
            read_binary,
            write_binary,
            save_file,
            rename_path,
            create_file,
            create_binary_file,
            create_dir,
            delete_path,
            get_opened_files
        ])
        .setup(|app| {
            // Windows/Linux cold start: argv 에서 파일 경로 확보.
            #[cfg(desktop)]
            {
                let args: Vec<String> = std::env::args().collect();
                *app.state::<OpenedFiles>().0.lock().unwrap() = extract_file_args(&args);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // macOS/iOS: 파일 열기는 RunEvent::Opened 로 온다.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().to_string())
                    .filter(|path| is_doc(path))
                    .collect();
                if !paths.is_empty() {
                    _app.state::<OpenedFiles>().0.lock().unwrap().extend(paths.clone());
                    let _ = _app.emit("opened-files", paths);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{atomic_write, create_binary_file, extract_file_args, percent_decode};

    #[test]
    fn decodes_unicode_binary_path() {
        assert_eq!(
            percent_decode("%2Ftmp%2F%ED%91%9C.xlsx").unwrap(),
            "/tmp/표.xlsx"
        );
        assert!(percent_decode("%xx").is_err());
    }

    #[test]
    fn extracts_all_supported_file_args() {
        let args = ["devkit", "--flag", "a.md", "b.pdf", "ignored.exe"]
            .map(String::from);
        assert_eq!(extract_file_args(&args), ["a.md", "b.pdf"]);
    }

    #[test]
    fn creates_binary_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.xlsx");
        let path = path.to_string_lossy().to_string();

        create_binary_file(path.clone(), b"workbook".to_vec()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"workbook");
        assert!(create_binary_file(path, b"replacement".to_vec()).is_err());
    }

    #[test]
    fn atomic_write_replaces_complete_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.xlsx");
        std::fs::write(&path, b"old").unwrap();

        atomic_write(&path, b"complete workbook").unwrap();

        assert_eq!(std::fs::read(path).unwrap(), b"complete workbook");
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_rejects_symlink_without_changing_target() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target.xlsx");
        let link = dir.path().join("sample.xlsx");
        std::fs::write(&target, b"original").unwrap();
        symlink(&target, &link).unwrap();

        assert!(atomic_write(&link, b"replacement").is_err());
        assert_eq!(std::fs::read(target).unwrap(), b"original");
        assert!(std::fs::symlink_metadata(link)
            .unwrap()
            .file_type()
            .is_symlink());
    }
}
