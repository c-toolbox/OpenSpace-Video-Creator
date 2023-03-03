const { invoke } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;
const { open } = window.__TAURI__.dialog
const { resourceDir } = window.__TAURI__.path

_USERNAME_ = "";
_FILE_NAME_ = "";
_INTERVAL_PROGRESS_ = null;
_INTERVAL_FRAMES_ = null;
_SCREENSHOTS_PATH_ = "";
_VIDEO_PATH_ = "";
_RECORDINGS_PATH_ = "";
_ANIMALS_ = null;
openspace = null;


const ASSERT_INPUT = () => { throw new Error('param is required'); };

//helper function to connect to opensapce
let connectToOpenSpace = () => {
  //setup the api params
  var api = window.openspaceApi(null, 4682);
  //notify users on disconnect
  api.onDisconnect(() => {
    set_disconnected_state();
    openspace = null;
  });
  //notify users and map buttons when connected
  api.onConnect(async () => {
    try {
      set_ready_state();
      openspace = await api.library();
      
      set_screenshot_path();
      set_video_export_path();

    } catch (e) {
      console.log('OpenSpace library could not be loaded: Error: \n', e);
      return;
    }
  })
  //connect
  api.connect();
};

async function reconnect() {
  connectToOpenSpace();
}


async function start_ffmpeg() {

  document.getElementById("ffmpeg_button").disabled = true;

  let pre_status = await invoke("pre_ffmpeg").then( (res) => {return res});
  //console.log("pre status: " + pre_status);

  if(pre_status.includes(0)) {

    _USERNAME_ = (document.getElementById("username").value).replace(/\s/g,'').replace(/[^a-z]/gi, '');
    _USERNAME_ = (_USERNAME_) ? _USERNAME_ : "Astronaut";
    let animalSuffix = get_animal_suffix();
    _FILE_NAME_ = name_builder(_USERNAME_, animalSuffix);
    
    //render status
    check_progress();
    let m = await invoke("start_ffmpeg", {screenshotspath: _SCREENSHOTS_PATH_, filename: _FILE_NAME_}).then( (msg) => {return msg});
    console.log(m);
  }
  else {
    //delete the progress.space file
    console.log("Error: Something went wrong in pre_ffmpeg");
    return;
  }
  //maybe:
  // check if success and return false/true depending on result
}

async function check_progress() {

  document.getElementById('container').classList.add("rendering");
  document.getElementById('connection-status').innerHTML = "Renderar video (0%) 🚀";

  let frame_count = await count_frames();

  let fname = async function() {
    let b = await invoke("check_if_rendering", {videopath: _VIDEO_PATH_}).then( (msg) => {return msg});
    
    let s = await invoke("check_progress", {path: "C:/Users/Adam/Videos"});
    s = s.split(/[\n]/).filter( line => line.includes("frame="));
    s = s.map( x => (x.replace(/\s/g,'')).split("fps=")[0].replace(/[^0-9]/gi,'') );

    if(s.length >= 1) {
      let percent = s[s.length - 1] / frame_count;
      let prog = parseFloat((percent * 100).toPrecision(2)) + "%";

      document.getElementById('connection-status').innerHTML = "Renderar video (" + prog + ") 🚀";

      if(percent === 1) {
        let r = await invoke("post_ffmpeg");
        console.log(r);
        
        clearInterval(_INTERVAL_PROGRESS_);
        clear_state();

        let d = new Date();
        let p = document.createElement("p");
        document.getElementById('messages').prepend(d.toTimeString().split(' ')[0] + " - filnamn: " + _FILE_NAME_, p);
        document.getElementById("ffmpeg_button").disabled = false;
      }
    }   
  }

  _INTERVAL_PROGRESS_ = setInterval(fname, 250);

}

async function set_screenshot_path() {
  _SCREENSHOTS_PATH_ = await get_screenshot_folder_path();
}

async function set_video_export_path() {
  var r = await readDir("",{ dir: BaseDirectory.Home});
  r.forEach((item) => {
    if(item.name === "Videos") {
      _VIDEO_PATH_ = item.path;
    }
  })
}

function format_path(path) {
  return path.replaceAll("\\", "/");
}

async function get_screenshot_folder_path(){
  let ret = await openspace.absPath("${SCREENSHOTS}");
  let rev = ret[1].split("\\");
  let str = "";

  for(let i = 0; i < rev.length-1; ++i) {
    if(i != rev.length-2) {
      str += rev[i] + "\\";
      continue;
    }
    str += rev[i];
  }

  return str;
}

function set_ready_state() {
  console.log('connected');
  document.getElementById('container').className = "connected";
  document.getElementById('connection-status').innerHTML = "Redo att köra 🛰️";

  document.getElementById('isDisconnected').style.display = "none";
  document.getElementById('isConnected').style.display = "block";

  document.getElementById("startrecording").style.display = "block";
  document.getElementById("stoprecording").style.display = "none";
}

function set_disconnected_state() {
  console.log("disconnected");
  document.getElementById('container').className = "disconnected";
  document.getElementById('connection-status').style.opacity = 1;
  document.getElementById('connection-status').innerHTML = "Du måste starta OpenSpace 🔧";
  
  document.getElementById('isDisconnected').style.display = "block";
  document.getElementById('isConnected').style.display = "none";
}

function set_recording_state() {
  document.getElementById('container').classList.add("recording");
  document.getElementById('connection-status').innerHTML = "Inspelning pågår 🎥";
}

function clear_state() {

  //not good
  document.getElementById('connection-status').classList.remove("recording");

  if(openspace == null) {
    set_disconnected_state();
  }

  if(openspace) {
    set_ready_state();
  }
}


async function count_frames() {
  let frame_count = await invoke("get_frame_count", {path: _SCREENSHOTS_PATH_});
  return frame_count;
}

function get_animal_suffix(){
  let num = get_randon_number(_ANIMALS_.length);
  let animal = (_ANIMALS_[num].name).replace(/\s/g,'').replace(/[^0-9a-z]/gi, '');
  animal += get_randon_number(1000); //0000 - 9999 
  console.log(animal);
  return animal;
}

async function load_animals() {
  _ANIMALS_ = await fetch("./animal-names.json")
.then(response => {
   return response.json();
});
}

function get_randon_number(max) {
  return Math.floor(Math.random() * max);
}

function name_builder(username, animalsuffix) {
  return username + "_OpenSpace_" + animalsuffix + ".mp4";
}

async function set_openspace_ui_state(state) {
  await openspace.setPropertyValueSingle("RenderEngine.ShowVersion", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowCamera", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowLog", state);
  await openspace.setPropertyValueSingle("Dashboard.IsEnabled", state);
  await openspace.setPropertyValueSingle("Modules.CefWebGui.Visible", state);
}

async function start_recording() {
  document.getElementById("startrecording").style.display = "none";
  document.getElementById("stoprecording").style.display = "block";

  filename = get_animal_suffix();

  set_recording_state();

  await openspace.sessionRecording.startRecording(filename)
}

async function stop_recording() {
  await openspace.sessionRecording.stopRecording()
  clear_state();
  document.getElementById("startrecording").style.display = "block";
  document.getElementById("stoprecording").style.display = "none";
}

function open_fs(path) {
  invoke("open_fs", {path: path});
}

function open_video_folder() {
  open_fs(_VIDEO_PATH_);
}

function open_screenshots_folder() {
  open_fs(_SCREENSHOTS_PATH_);
}

async function get_latest_recording(path) {
  return await invoke("get_latest_recording", {path: path});
}

async function generate_frames() {

  document.getElementById('container').classList.add("generating");
  document.getElementById('connection-status').innerHTML = "Skapar bildsekvens 🎞️";

  _RECORDINGS_PATH_ = (await openspace.absPath("${RECORDINGS}"))[1];

  await openspace.sessionRecording.enableTakeScreenShotDuringPlayback(60);

  await set_openspace_ui_state(false);

  //nuke folder
  await invoke("nuke_screenshots_folder", {screenshotfolderpath: _SCREENSHOTS_PATH_});

  //reset counter
  await openspace.resetScreenshotNumber();

  //render
  let filename = await get_latest_recording(_RECORDINGS_PATH_);
  await openspace.sessionRecording.startPlayback(filename,false);

  let looper = async function() {
    let isplaying = (await openspace.sessionRecording.isPlayingBack())[1];
    console.log("playback!");
    if (!isplaying) {
      clearInterval(_INTERVAL_FRAMES_);
      await set_openspace_ui_state(true);
      clear_state();
    }
  }

  _INTERVAL_FRAMES_ = await setInterval(looper, 250);
}

async function generate_outro() {
  document.getElementById('messages').prepend(await resourceDir());
  await invoke("generate_outro", {username: _USERNAME_, filename: _FILE_NAME_});
}