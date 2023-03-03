#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// ^^^^^^ Must be first ^^^^^^

// Code goes below

use tauri::FileDropEvent;

#[tauri::command]
async fn pre_ffmpeg() -> String {
  let create_indication_file = "New-Item $Env:temp/rendering.space -Force";
  let out_cif = std::process::Command::new("powershell").args(["-command", create_indication_file]).output().expect("Error running create_indication_file");
  return (out_cif.status).to_string();
}

#[tauri::command]
async fn start_ffmpeg(screenshotspath: String, filename: String) -> Vec<String> {


  let path = get_latest_directory(screenshotspath);

  //make dynamic output name (Adam_OpenSpace_2023-03-14.mp4)
  let ffmpeg_code = "$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'; (echo Y | ffmpeg -framerate 60 -i '".to_owned() + &path + "/OpenSpace_%06d.png' -c:v libx264 -pix_fmt yuv420p -s 1920x1080 -crf 23 $Env:temp/" + &filename + " -hide_banner 1> $Env:temp/progress.space 2>&1)";
  
  

  let out_fc = std::process::Command::new("powershell").args(["-command", &ffmpeg_code]).output().expect("Error running ffmpeg_code");
  

  let vec = vec![(out_fc.status).to_string()];

  return vec;

}

#[tauri::command]
async fn post_ffmpeg() -> Vec<String> {
  let remove_indication_file = "Remove-Item $Env:temp/rendering.space";
  let remove_progress_file = "Remove-Item $Env:temp/progress.space";
  
  let out_pif = std::process::Command::new("powershell").args(["-command", remove_progress_file]).output().expect("Error running remove_progress_file");
  let out_rif = std::process::Command::new("powershell").args(["-command", remove_indication_file]).output().expect("Error running remove_indication_file");
  
  let vec = vec![(out_pif.status).to_string(), (out_rif.status).to_string()];
  return vec;
}

#[tauri::command]
async fn check_if_rendering(videopath: String) -> bool{
  let fullpath = std::env::temp_dir().to_string_lossy().into_owned() + "rendering.space";
  let b = std::path::Path::new(&fullpath).exists();
  return b;
}

fn get_latest_directory(path: String) -> String {
  let mut map: std::collections::HashMap<String, std::time::Duration> = std::collections::HashMap::new();
  let mut retpath = String::new();

  if path.to_lowercase().contains("screenshots") && path.to_lowercase().contains("openspace") {
    if let Ok(entries) = std::fs::read_dir(&path) {
      for entry in entries {
        if let Ok(entry) = entry {
          if let Ok(metadata) = entry.metadata() {
            map.insert(String::from(entry.path().display().to_string()), metadata.modified().unwrap().elapsed().unwrap());
          }
        }
      }
    }
  
    let mut rettime: std::time::Duration = std::time::Duration::from_secs(std::u64::MAX);
  
    for(k,v) in map.iter() {
      if rettime > *v {
        rettime = *v;
        retpath = (&k).to_string();
      }
    }
  }

  return retpath;
}


#[tauri::command]
async fn check_progress(path: String) -> String{

  let progress_file = std::env::temp_dir().to_string_lossy().into_owned() + "progress.space";

  let contents = std::fs::read_to_string(progress_file)
        .expect("Should have been able to read the file");

  return contents;
}


#[tauri::command]
async fn get_frame_count(path: String) -> u32 {
  let screenshot_folder_path = get_latest_directory(path);
  let paths = std::fs::read_dir(screenshot_folder_path).unwrap();
  return paths.count().try_into().unwrap();
}


#[tauri::command]
async fn open_fs(path: String) {
  std::process::Command::new( "explorer" )
  .arg( path )
  .spawn( )
  .unwrap( );
}


#[tauri::command]
async fn get_latest_recording(path: String) -> String{
  let mut map: std::collections::HashMap<String, std::time::Duration> = std::collections::HashMap::new();

  if let Ok(entries) = std::fs::read_dir(&path) {
    for entry in entries {
      if let Ok(entry) = entry {
        if let Ok(metadata) = entry.metadata() {
          let p = String::from(entry.path().display().to_string());
          let d = metadata.modified().unwrap().elapsed().unwrap();
          if p.contains(".osrec") {
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

  return retpath;
}

#[tauri::command]
async fn nuke_screenshots_folder(screenshotfolderpath: String) {

  let currentfolder = get_latest_directory(screenshotfolderpath);
  let mut counter = 0;

  if let Ok(entries) = std::fs::read_dir(currentfolder) {
    for entry in entries {
      if let Ok(entry) = entry {
        let filename = entry.path().file_name().unwrap().to_string_lossy().into_owned();
        if filename.contains("OpenSpace_") && filename.contains(".png") {
          if let Ok(res) = std::fs::remove_file(entry.path()) {
            counter += 1;
          }
        }
      }
    }
  }

  println!("Deleted {} number of files", counter);

}

#[tauri::command] async fn generate_outro(handle: tauri::AppHandle, username: String, filename: String) {

  // Get asset path for outro-mp4 and robot.ttf
  let outro_path = (handle.path_resolver()
  .resolve_resource("assets/outro.mp4")
  .expect("failed to resolve resource")).to_string_lossy().into_owned();

  let mut font_path = (handle.path_resolver()
  .resolve_resource("assets/roboto.ttf")
  .expect("failed to resolve resource")).to_string_lossy().into_owned();

  font_path = font_path.chars().skip(4).collect();
  font_path = font_path.replace("\\", "/");
  font_path = font_path.replace(":", "\\:");

  // Generate outro file with text on
  let named_outro = "$Env:temp/named_outro.mp4";
  let add_name_to_video = "ffmpeg -y -i ".to_owned() + &outro_path + " -vf \"drawtext=fontfile='" + &font_path + "':text=" + &username + ":fontcolor=white:fontsize=128:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=(h-text_h-128)/2\" -codec:a copy " + named_outro;
  std::process::Command::new("powershell").args(["-command", &add_name_to_video]).output().expect("Error generating named_outro.mp4");


  // Generate concat txt
  let list_path = "$Env:temp/list.space";
  let create_list_file = "New-Item ".to_owned() + list_path + " -Force";
  std::process::Command::new("powershell").args(["-command", &create_list_file]).output().expect("Error creating list.txt");

  // Populate list.txt with the videos that should be merged
  let temp_folder = std::env::temp_dir().to_string_lossy().into_owned();
  let line1 = "\"file '".to_owned() + &temp_folder + &filename + "'\"";
  let line2 = "\"file '".to_owned() + &temp_folder + "named_outro.mp4'\"";

  std::process::Command::new("powershell").args(["-command", &(line1 + " | Out-File -Encoding ASCII -append " + &list_path)]).output().expect("Error adding line 1 to list.txt");
  std::process::Command::new("powershell").args(["-command", &(line2 + " | Out-File -Encoding ASCII -append " + &list_path)]).output().expect("Error adding line 2 to list.txt");

  // Concat Video and named_outro 
  let merge_videos = "ffmpeg -y -safe 0 -f concat -i ".to_owned() + list_path + " -c copy $HOME/Videos/" + &filename;
  std::process::Command::new("powershell").args(["-command", &merge_videos]).output().expect("Error exporting video with outro");

  // Remove named_outro, original video, list.space
  let remove_named_outro = "Remove-Item $Env:temp/named_outro.mp4";
  let remove_video = "Remove-Item $Env:temp/".to_owned() + &filename;
  let remove_list_space = "Remove-Item $Env:temp/list.space";

  std::process::Command::new("powershell").args(["-command", &remove_named_outro]).output().expect("Error deleting named_outro.mp4");
  std::process::Command::new("powershell").args(["-command", &remove_video]).output().expect("Error deleting exported video");
  std::process::Command::new("powershell").args(["-command", &remove_list_space]).output().expect("Error deleting space.list");


  //let code = "explorer .";
  //let out = std::process::Command::new("powershell").args(["-command", &code]).output().expect("Error running test code");
  //println!("{}", resource_path);
}

// Todo:
// create a function that check if ffmpeg log-file exists, and if it does, parse it and try to figuire out how far the rendering has come.
// to prevent mal-reading of file due to in-progress line writing, always remove the latest line and then check for "frame= ".

fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler!
        [
          start_ffmpeg, pre_ffmpeg, check_if_rendering, check_progress, 
          get_frame_count, open_fs, get_latest_recording, nuke_screenshots_folder,
          post_ffmpeg, generate_outro
        ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
