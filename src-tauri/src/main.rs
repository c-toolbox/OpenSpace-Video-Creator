#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// ^^^^^^ Must be first ^^^^^^

// "namepsaces"
use std::{os::windows::process::CommandExt};



/*
* Starts the ffmpeg command to create video from the generated frames
* Returns the PID of the Powershell process
*/
#[tauri::command]
async fn render_sequence(handle: tauri::AppHandle, filename: String, screenshotspath: String, framerate: u32, startindex: i32) -> u32 {
  let ffmpeg_path:String = handle.path_resolver()
      .resolve_resource("assets/ffmpeg.exe")
      .expect("failed to resolve ffmpeg path")
      .canonicalize().unwrap().to_string_lossy().into_owned();

  let mut start_index_command = String::new();
  if startindex > -1 {
    start_index_command = " -start_number ".to_owned() + &startindex.to_string();
  } 

  let ffmpeg_code = "$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'; (echo Y | &'".to_owned() + &ffmpeg_path + "' -framerate " + &framerate.to_string() + &start_index_command + " -i '" + &screenshotspath + "/OpenSpace_%06d.png' -c:v libx264 -pix_fmt yuv420p -s 1920x1080 -crf 17 $Env:temp/" + &filename + ".mp4 -loglevel quiet)";
  let child = std::process::Command::new("powershell")
        .args(["-command", &ffmpeg_code])
        .creation_flags(0x08000000)
        .spawn().expect("Error running ffmpeg_code");

  return child.id();
}


/* 
* Renames a rendered sequence (mp4) to another name.
* Used when preparing for concatenation of video files
*/
#[tauri::command]
async fn rename_sequence(filename: String, newname: String) {
  let mv = "Move-Item $Env:temp/".to_owned() + &filename + ".mp4 " + "$Env:temp/" + &newname + ".mp4 -force";
  let mut child = std::process::Command::new("powershell")
        .args(["-command", &mv])
        .creation_flags(0x08000000)
        .spawn()
        .unwrap();
  let _res = child.wait();
}



/* 
* Removes temporary log files, etc
*/
#[tauri::command]
async fn clean_some(screenshotfolderpath: String) {
  // Cleans up all old screenshots
  nuke_screenshots_folder(screenshotfolderpath);
}



/* 
* Removes temporary log files, etc
*/
#[tauri::command]
async fn clean_all(screenshotfolderpath: String) {

  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/osv_chunk.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/osv_progress.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/osv.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/named_outro.mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/list.space").err();

  // Cleans up all old screenshots
  nuke_screenshots_folder(screenshotfolderpath);
}



/*
* Checks if the ffmpeg command is still running by querying if the PID is still alive
*/ 
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



/*
* Opens a generic path in File Explorer
*/
#[tauri::command]
async fn open_fs(path: String) {
  std::process::Command::new( "explorer" )
  .arg( path )
  .spawn( )
  .unwrap( );
}



/*
* Returns all recordings (to be filtered on the JS side)
*/ 
#[tauri::command]
async fn get_all_recordings(path: String) -> Vec<Vec<String>> {
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

  let mut retvec = vec![];

  for(k,v) in map.iter() {
    retvec.push(vec![(&k).to_string(), (*v).as_millis().to_string()]);
  }

  return retvec;
}



/*
* Removes all openspace screenshots for a given path.
* (checks if extention is png and if contains openspace_ in the file name)
*/
fn nuke_screenshots_folder(screenshotfolderpath: String) {
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



/*
* Generates the outro video with the User's name in it and then merges that with
* the previously generated video based on the recorded flight
*/
#[tauri::command] 
async fn generate_outro_and_merge(handle: tauri::AppHandle, username: String, filename: String, date: String, framerate: u32, flag: bool) {

  // If flag is true, we skip outro and just move the generated video to User Video folder
  if flag {
    let mv = "Move-Item $Env:temp/osv.mp4 ".to_owned() + "$HOME/Videos/" + &filename + " -force";
    std::process::Command::new("powershell")
          .args(["-command", &mv])
          .creation_flags(0x08000000)
          .output()
          .expect("Error exporting video with outro");
    return;
  }

  // Get asset path for outro.mp4 (30 or 60 fps) and robot.ttf
  let outro_path;
  if framerate == 30 {
    outro_path = (handle.path_resolver()
    .resolve_resource("assets/outro_30fps.mp4")
    .expect("failed to resolve resource")).canonicalize().unwrap().to_string_lossy().into_owned();
  }
  else {
    outro_path = (handle.path_resolver()
    .resolve_resource("assets/outro_60fps.mp4")
    .expect("failed to resolve resource")).canonicalize().unwrap().to_string_lossy().into_owned();
  }

  let mut font_path = (handle.path_resolver()
  .resolve_resource("assets/roboto.ttf")
  .expect("failed to resolve resource")).to_string_lossy().into_owned();

  font_path = font_path.chars().skip(4).collect();
  font_path = font_path.replace("\\", "/");
  font_path = font_path.replace(":", "\\:");

  // Generate outro file with text on
  let ffmpeg_path:String = handle.path_resolver()
  .resolve_resource("assets/ffmpeg.exe")
  .expect("failed to resolve ffmpeg path")
  .canonicalize().unwrap().to_string_lossy().into_owned();

  let named_outro = "$Env:temp/named_outro.mp4";
  let add_name_to_video = "&'".to_owned() + &ffmpeg_path + "' -y -i '" + &outro_path + 
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
  let line1 = "\"file '".to_owned() + &temp_folder + "osv.mp4'\"";
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

  let merge_videos = "&'".to_owned() + &ffmpeg_path + "' -y -safe 0 -f concat -i " + list_path + " -c copy $HOME/Videos/" + &filename;
  std::process::Command::new("powershell")
        .args(["-command", &merge_videos])
        .creation_flags(0x08000000)
        .output()
        .expect("Error exporting video with outro");
}



/* 
* Merges two video files
* Used when merging the newest rendered chunk with the previously combined videos
*/
#[tauri::command] 
async fn merge(handle: tauri::AppHandle, progressname: String, chunkname: String, outputname: String) {

  let ffmpeg_path:String = handle.path_resolver()
  .resolve_resource("assets/ffmpeg.exe")
  .expect("failed to resolve ffmpeg path")
  .canonicalize().unwrap().to_string_lossy().into_owned();

  // Generate concat txt file
  let list_path = "$Env:temp/list.space";
  let create_list_file = "New-Item ".to_owned() + list_path + " -Force";
  std::process::Command::new("powershell")
        .args(["-command", &create_list_file])
        .creation_flags(0x08000000)
        .output()
        .expect("Error creating list.txt");

  // Populate list.txt with the videos that should be merged
  let temp_folder = std::env::temp_dir().to_string_lossy().into_owned();
  let line1 = "\"file '".to_owned() + &temp_folder + &progressname + ".mp4'\"";
  let line2 = "\"file '".to_owned() + &temp_folder + &chunkname + ".mp4'\"";

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

  let merge_videos = "&'".to_owned() + &ffmpeg_path + "' -y -safe 0 -f concat -i " + list_path + " -c copy $Env:temp/" + &outputname + ".mp4 -loglevel quiet";
  let mut child = std::process::Command::new("powershell")
        .args(["-command", &merge_videos])
        .creation_flags(0x08000000)
        .spawn()
        .unwrap();
  let _res = child.wait();

  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/" + &chunkname + ".mp4").err();
  std::fs::remove_file(std::env::temp_dir().to_string_lossy().into_owned() + "/" + &progressname + ".mp4").err();

}



/*
* Kills the running PID for any stage
*/
#[tauri::command]
async fn abort(pid: u32) {
  let cmd = "kill ".to_owned() + &pid.to_string();
  let mut child = std::process::Command::new("powershell")
        .args(["-command", &cmd])
        .creation_flags(0x08000000)
        .spawn()
        .expect("Error");
  let _res = child.wait();
}



/*
* Workaround for older OpenSpace versions (<19.0)
*/
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



/*
* Get openspace.exe path (used to get installation folder)
*/
#[tauri::command]
async fn get_exec_path() -> String {
  let cmd = "(Get-Process | Where {$_.Name -eq 'openspace'} | Select-Object -ExpandProperty Path)";
  let q = std::process::Command::new("powershell")
        .args(["-command", &cmd])
        .creation_flags(0x08000000)
        .output()
        .expect("Error");

  let res = std::str::from_utf8(&q.stdout).unwrap();

  return String::from(res);
}



/*
* Get openspace.exe path (used to get installation folder)
*/
#[tauri::command]
async fn get_content_as_string(path: String) -> String {
  let contents = std::fs::read_to_string(path)
    .expect("Should have been able to read the file");

  return contents;
}



// TAURI 
fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler!
        [
          check_if_rendering, open_fs, generate_outro_and_merge, 
          get_screenshot_names, get_all_recordings, abort, get_exec_path,
          get_content_as_string, render_sequence, merge, clean_some, 
          clean_all, rename_sequence
        ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
