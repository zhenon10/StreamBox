#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn write_crash_log(text: &str) {
  let dir = std::env::var_os("LOCALAPPDATA")
    .map(std::path::PathBuf::from)
    .unwrap_or_else(std::env::temp_dir)
    .join("IvPlayer");
  let _ = std::fs::create_dir_all(&dir);
  let _ = std::fs::write(dir.join("ivplayer-error.log"), text);
}

fn main() {
  std::panic::set_hook(Box::new(|info| {
    write_crash_log(&format!("panic: {info}"));
  }));
  ivplayer_lib::run();
}
