#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn start_ffmpeg() {
  let code = "$dir = ($HOME + '/Videos'); New-Item ($dir + '/working.txt'); echo Y | ffmpeg -framerate 60 -i 'C:/OpenSpace/DATA/user/screenshots/2023-02-23-14-36/OpenSpace_%06d.png' -c:v libx264 -pix_fmt yuv420p -crf 23 $HOME/Videos/output.mp4 -hide_banner 1>$HOME/Videos/output-log.txt 2>&1; New-Item ($dir + '/done.txt')";
  std::process::Command::new("powershell").args(["-command", code]).spawn();
}

//return $VIDEO
#[tauri::command]
fn getAbsVideoPath() {
    // https://crates.io/crates/directories 
}

// Todo:
// create a function that check if ffmpeg log-file exists, and if it does, parse it and try to figuire out how far the rendering has come.
// to prevent mal-reading of file due to in-progress line writing, always remove the latest line and then check for "frame= ".

fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![start_ffmpeg, greet])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
