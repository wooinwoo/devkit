use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// cold start 때 넘어온 파일 경로 보관 (프론트가 아직 안 떠 있을 때 대비).
#[derive(Default)]
struct OpenedFile(Mutex<Option<String>>);

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
        "pdf" => Some("pdf"),
        "xlsx" | "xls" | "csv" | "tsv" => Some("xlsx"),
        "pptx" | "ppt" => Some("pptx"),
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
fn extract_file_arg(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && is_doc(a))
        .cloned()
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

/// 임의 절대경로 읽기 (파일연결로 온 경로도 scope 제약 없이).
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 원본 경로에 저장.
#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 바이너리 파일 바이트 읽기 (hwp 등 — 프론트에서 Uint8Array 로 처리).
#[tauri::command]
fn read_binary(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// 바이너리 저장 (이미지 붙여넣기 등).
#[tauri::command]
fn write_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
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
fn get_opened_file(app: tauri::AppHandle) -> Option<String> {
    app.state::<OpenedFile>().0.lock().unwrap().clone()
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
            if let Some(path) = extract_file_arg(&argv) {
                let _ = app.emit("opened-file", path);
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
        .manage(OpenedFile::default())
        .invoke_handler(tauri::generate_handler![
            list_docs,
            read_file,
            read_binary,
            write_binary,
            save_file,
            rename_path,
            create_file,
            create_dir,
            delete_path,
            get_opened_file
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Windows/Linux cold start: argv 에서 파일 경로 확보.
            #[cfg(desktop)]
            {
                let args: Vec<String> = std::env::args().collect();
                if let Some(path) = extract_file_arg(&args) {
                    *app.state::<OpenedFile>().0.lock().unwrap() = Some(path);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // macOS/iOS: 파일 열기는 RunEvent::Opened 로 온다.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in &urls {
                    if let Ok(path) = url.to_file_path() {
                        let p = path.to_string_lossy().to_string();
                        *_app.state::<OpenedFile>().0.lock().unwrap() = Some(p.clone());
                        let _ = _app.emit("opened-file", p);
                    }
                }
            }
        });
}
