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
async fn pre_ffmpeg() -> String {
  let create_indication_file = "New-Item $HOME/Videos/rendering.space";
  let out_cif = std::process::Command::new("powershell").args(["-command", create_indication_file]).output().expect("Error running create_indication_file");
  return (out_cif.status).to_string();
}

#[tauri::command]
async fn start_ffmpeg() -> Vec<String> {

  let ffmpeg_code = "(echo Y | ffmpeg -framerate 60 -i 'C:/OpenSpace/DATA/user/screenshots/2023-02-23-14-36/OpenSpace_%06d.png' -c:v libx264 -pix_fmt yuv420p -crf 23 $HOME/Videos/output.mp4 -hide_banner 1> $HOME/Videos/progress.space 2>&1)";
  let remove_indication_file = "Remove-Item $HOME/Videos/rendering.space";

  let out_fc = std::process::Command::new("powershell").args(["-command", ffmpeg_code]).output().expect("Error running ffmpeg_code");
  let put_rif = std::process::Command::new("powershell").args(["-command", remove_indication_file]).output().expect("Error running remove_indication_file");

  let mut v : Vec<String> = Vec::new();
  let mut vec = vec![(out_fc.status).to_string(), (put_rif.status).to_string()];

  return vec;
}

#[tauri::command]
async fn check_progress() -> bool{
  let b = std::path::Path::new("C:/Users/Adam/Videos/rendering.space").exists();
  return b;
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
      .invoke_handler(tauri::generate_handler![start_ffmpeg, pre_ffmpeg, check_progress, greet])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
