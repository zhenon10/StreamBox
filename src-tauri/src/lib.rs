use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct M3uFile {
  name: String,
  content: String,
}

fn device_id_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("device-id.txt"))
}

fn alnum_len(value: &str) -> usize {
  value.chars().filter(|c| c.is_ascii_alphanumeric()).count()
}

#[cfg(target_os = "windows")]
mod win_keep_awake {
  const ES_CONTINUOUS: u32 = 0x8000_0000;
  const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
  const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

  #[link(name = "kernel32")]
  extern "system" {
    fn SetThreadExecutionState(flags: u32) -> u32;
  }

  pub fn set(enabled: bool) {
    unsafe {
      if enabled {
        let _ = SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
      } else {
        let _ = SetThreadExecutionState(ES_CONTINUOUS);
      }
    }
  }
}

#[tauri::command]
fn get_or_create_device_id(app: tauri::AppHandle) -> Result<String, String> {
  let file = device_id_path(&app)?;
  if let Ok(existing) = fs::read_to_string(&file) {
    let trimmed = existing.trim().to_string();
    if alnum_len(&trimmed) >= 12 {
      return Ok(trimmed);
    }
  }
  let id = format!("sb_{}", uuid::Uuid::new_v4());
  fs::write(&file, &id).map_err(|e| e.to_string())?;
  Ok(id)
}

#[tauri::command]
fn set_device_id(app: tauri::AppHandle, id: String) -> Result<(), String> {
  let trimmed = id.trim().to_string();
  if alnum_len(&trimmed) < 12 {
    return Err("device id too short".into());
  }
  let file = device_id_path(&app)?;
  fs::write(&file, &trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_m3u_file(app: tauri::AppHandle) -> Result<Option<M3uFile>, String> {
  let app2 = app.clone();
  let picked = tauri::async_runtime::spawn_blocking(move || {
    app2
      .dialog()
      .file()
      .add_filter("M3U Playlist", &["m3u", "m3u8"])
      .blocking_pick_file()
  })
  .await
  .map_err(|e| e.to_string())?;

  let Some(file_path) = picked else {
    return Ok(None);
  };
  let path = file_path.into_path().map_err(|e| e.to_string())?;
  let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  let name = path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("playlist.m3u")
    .to_string();
  Ok(Some(M3uFile { name, content }))
}

#[tauri::command]
fn set_keep_awake(enabled: bool) {
  #[cfg(target_os = "windows")]
  win_keep_awake::set(enabled);
  #[cfg(not(target_os = "windows"))]
  let _ = enabled;
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
  app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let result = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      get_or_create_device_id,
      set_device_id,
      pick_m3u_file,
      set_keep_awake,
      exit_app
    ])
    .run(tauri::generate_context!());

  if let Err(error) = result {
    let message = format!("error while running IvPlayer: {error:#}");
    let dir = std::env::var_os("LOCALAPPDATA")
      .map(std::path::PathBuf::from)
      .unwrap_or_else(std::env::temp_dir)
      .join("IvPlayer");
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(dir.join("ivplayer-error.log"), &message);
    std::process::exit(1);
  }
}
