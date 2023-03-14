#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// ^^^^^^ Must be first ^^^^^^

// "namepsaces"
use std::{os::windows::process::CommandExt};


// Creates file used for ffmpeg output
// Returns Powershell command execution status
#[tauri::command]
async fn pre_ffmpeg() -> String {
  let create_indication_file = "New-Item $Env:temp/progress.space -Force";
  let out_cif = std::process::Command::new("powershell")
        .args(["-command", create_indication_file])
        .creation_flags(0x08000000)
        .output()
        .expect("Error running create_indication_file");
  return (out_cif.status).to_string();
}

// Starts the ffmpeg command to create video from the generated frames
// Returns the PID of the Powershell process
#[tauri::command]
async fn start_ffmpeg(screenshotspath: String, startindex: i32) -> u32 {
  
  let mut start_index_command = String::new();
  if startindex > -1 {
    start_index_command = "-start_number ".to_owned() + &startindex.to_string();
  } 

  println!("{}", start_index_command);

  let ffmpeg_code = "$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'; (echo Y | ffmpeg -framerate 60 ".to_owned() + &start_index_command + " -i '" + &screenshotspath + "/OpenSpace_%06d.png' -c:v libx264 -pix_fmt yuv420p -s 1920x1080 -crf 23 $Env:temp/openspace_video.mp4 -hide_banner 1> $Env:temp/progress.space 2>&1)";
  let child = std::process::Command::new("powershell")
        .args(["-command", &ffmpeg_code])
        .creation_flags(0x08000000)
        .spawn().expect("Error running ffmpeg_code");

  return child.id();
}

// Removes temporary log files, etc
#[tauri::command]
async fn clean_up(){
  // Remove progress.space file
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/progress.space").err();

  // Remove temporary generated files: named_outro.mp4, openspace_video.mp4, list.space
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/named_outro.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/openspace_video.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/list.space").err();
}

// Checks if the ffmpeg command is still running by querying if the PID is still alive
#[tauri::command]
async fn check_if_rendering(pid: u32) -> bool{
  let output = std::process::Command::new("tasklist")
        .arg("/fi")
        .arg(format!("PID eq {}", pid))
        .creation_flags(0x08000000)
        .output()
        .expect("failed to execute command");
  return String::from_utf8_lossy(&output.stdout).contains(&format!("{} ", pid));
}

// Returns the contents of the progress file with output from ffmpeg
#[tauri::command]
async fn check_progress() -> String{

  let progress_file = std::env::temp_dir().to_string_lossy().into_owned() + "progress.space";

  let contents = std::fs::read_to_string(progress_file)
        .expect("Should have been able to read the file");

  return contents;
}

// Returns the number of generated frames/screenshots
// Used when calculating progress based on ffmpeg output 
#[tauri::command]
async fn get_frame_count(path: String) -> u32 {
  let paths = std::fs::read_dir(path).unwrap();
  return paths.count().try_into().unwrap();
}

// Opens a generic path in File Explorer
#[tauri::command]
async fn open_fs(path: String) {
  std::process::Command::new( "explorer" )
  .arg( path )
  .spawn( )
  .unwrap( );
}

// Finds the latest openspace recording (.osrec) in a given path
#[tauri::command]
async fn get_latest_recording(path: String) -> Vec<String> {
  let mut map: std::collections::HashMap<String, std::time::Duration> = std::collections::HashMap::new();

  if let Ok(entries) = std::fs::read_dir(&path) {
    for entry in entries {
      if let Ok(entry) = entry {
        if let Ok(metadata) = entry.metadata() {
          let p = String::from(entry.path().display().to_string());
          let d = metadata.modified().unwrap().elapsed().unwrap();
          if entry.path().extension().unwrap().to_ascii_lowercase() == "osrec" {
            map.insert(p, d);
          }
        }
      }
    }
  }

  let mut retpath = String::new();
  let mut rettime: std::time::Duration = std::time::Duration::from_secs(std::u64::MAX);

  for(k,v) in map.iter() {
    if rettime > *v {
      rettime = *v;
      retpath = (&k).to_string();
    }
  }
  
  let retvec = vec![retpath, rettime.as_millis().to_string()];

  return retvec;
}

// Removes all openspace screenshots for a given path.
// (checks if extention is png and if contains openspace_ in the file name)
#[tauri::command]
async fn nuke_screenshots_folder(screenshotfolderpath: String) {
  let mut counter = 0;

  if !screenshotfolderpath.is_empty() {
    if let Ok(entries) = std::fs::read_dir(screenshotfolderpath) {
      for entry in entries {
        if let Ok(entry) = entry {
          let filename = entry.path().file_name().unwrap().to_string_lossy().into_owned();
          if entry.path().extension().unwrap().to_ascii_lowercase() == "png" && filename.starts_with("OpenSpace_") {
            if let Ok(_res) = std::fs::remove_file(entry.path()) {
              counter += 1;
            }
          }
        }
      }
    }
  }

  println!("Deleted {} number of files", counter);

}

// Function that generates the outro video with the User's name in it and then merges that with
// the previously generated video based on the recorded flight
#[tauri::command] 
async fn generate_outro_and_merge(handle: tauri::AppHandle, username: String, filename: String, date: String) {

  // Get asset path for outro-mp4 and robot.ttf
  let outro_path = (handle.path_resolver()
  .resolve_resource("assets/outro.mp4")
  .expect("failed to resolve resource")).canonicalize().unwrap().to_string_lossy().into_owned();

  let mut font_path = (handle.path_resolver()
  .resolve_resource("assets/roboto.ttf")
  .expect("failed to resolve resource")).to_string_lossy().into_owned();

  font_path = font_path.chars().skip(4).collect();
  font_path = font_path.replace("\\", "/");
  font_path = font_path.replace(":", "\\:");

  // Generate outro file with text on
  let named_outro = "$Env:temp/named_outro.mp4";
  let add_name_to_video = "ffmpeg -y -i '".to_owned() + &outro_path + 
        "' -vf \"drawtext=fontfile='" + &font_path + "':text=" + &username + ":fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2," +
        "drawtext=fontfile='" + &font_path + "':text=" + &date + ":fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-96)" +
        "\" -codec:a copy " + named_outro;
  
  
  std::process::Command::new("powershell")
        .args(["-command", &add_name_to_video])
        .creation_flags(0x08000000)
        .output()
        .expect("Error generating named_outro.mp4");


  // Generate concat txt
  let list_path = "$Env:temp/list.space";
  let create_list_file = "New-Item ".to_owned() + list_path + " -Force";
  std::process::Command::new("powershell")
        .args(["-command", &create_list_file])
        .creation_flags(0x08000000)
        .output()
        .expect("Error creating list.txt");

  // Populate list.txt with the videos that should be merged
  let temp_folder = std::env::temp_dir().to_string_lossy().into_owned();
  let line1 = "\"file '".to_owned() + &temp_folder + "openspace_video.mp4'\"";
  let line2 = "\"file '".to_owned() + &temp_folder + "named_outro.mp4'\"";

  std::process::Command::new("powershell")
        .args(["-command", &(line1 + " | Out-File -Encoding ASCII -append " + &list_path)])
        .creation_flags(0x08000000)
        .output()
        .expect("Error adding line 1 to list.txt");

  std::process::Command::new("powershell")
        .args(["-command", &(line2 + " | Out-File -Encoding ASCII -append " + &list_path)])
        .creation_flags(0x08000000)
        .output()
        .expect("Error adding line 2 to list.txt");

  // Concat Video and named_outro 
  let merge_videos = "ffmpeg -y -safe 0 -f concat -i ".to_owned() + list_path + " -c copy $HOME/Videos/" + &filename;
  std::process::Command::new("powershell")
        .args(["-command", &merge_videos])
        .creation_flags(0x08000000)
        .output()
        .expect("Error exporting video with outro");
}

// Workaround for older OpenSpace versions (<19.0)
#[tauri::command]
async fn get_screenshot_names(screenshotfolderpath: String) -> Vec<String> {
  let mut v: Vec<String> = vec![];
  if !screenshotfolderpath.is_empty() {
    if let Ok(entries) = std::fs::read_dir(screenshotfolderpath) {
      for entry in entries {
        if let Ok(entry) = entry {
          let filename = entry.path().file_name().unwrap().to_string_lossy().into_owned();
          if entry.path().extension().unwrap().to_ascii_lowercase() == "png" && filename.starts_with("OpenSpace_") {
            v.push(filename);
          }
        }
      }
    }
  }
  return v;
}

// TAURI 
fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler!
        [
          start_ffmpeg, pre_ffmpeg, check_if_rendering, check_progress, 
          get_frame_count, open_fs, get_latest_recording, nuke_screenshots_folder,
          clean_up, generate_outro_and_merge, get_screenshot_names
        ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
