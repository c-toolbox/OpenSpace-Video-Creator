const { invoke } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;
const { isPermissionGranted, requestPermission, sendNotification } = window.__TAURI__.notification

_SCREENSHOTS_PATH_ = "";
_VIDEO_PATH_ = "";
_RECORDINGS_PATH_ = "";
_ANIMALS_ = null;
openspace = null;
_ANIMAL_SUFFIX_ = "";
_STARTING_INDEX_ = Number.MAX_SAFE_INTEGER;

// States
READY = 0;
DISCONNECTED = 1;
VIDEO = 2;

RECORDING = 99;

// Constant
const MILLISECONDS_PER_DAY = 86400000;

// Helper function to sleep the thread for some time
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Helper function to connect to opensapce
let connectToOpenSpace = () => {
  
  //setup the api params
  var api = window.openspaceApi(null, 4682);
  
  //notify users on disconnect
  api.onDisconnect( async () => {
    await set_state(DISCONNECTED);
    openspace = null;
  });
  
  //notify users and map buttons when connected
  api.onConnect(async () => {
    try {
      openspace = await api.library();
      
      await set_screenshot_path();
      await set_video_export_path();
      await set_recordings_path();

      await set_state(READY);
    } catch (e) {
      console.log('OpenSpace library could not be loaded: Error: \n', e);
      return;
    }
  })
  
  //connect
  api.connect();
};

// Starts ffmpeg to generate main video file from generated frames
async function start_ffmpeg() {
  let pre_status = await invoke("pre_ffmpeg").then( (res) => {return res});
  if(pre_status.includes(0)) {    
    return await invoke("start_ffmpeg", {screenshotspath: _SCREENSHOTS_PATH_, startindex: (_STARTING_INDEX_ == Number.MAX_SAFE_INTEGER) ? -1 : _STARTING_INDEX_ }).then( (msg) => {return msg});
  }
  else {
    console.log("Error: Something went wrong in pre_ffmpeg");
    alert("VARNING: Något gick fel, testa att starta om programmet och kör igen");
    await invoke("clean_up");
    return -1;
  }
}

// Checks the rendering progress for main video file from the generated frames
async function check_progress(pid) {
  document.getElementById('container').classList.add("rendering");
  document.getElementById('connection-status').innerHTML = "Renderar video (0%) 🚀";

  let frame_count = await count_frames();

  while(true) {
    let isRendering = await invoke("check_if_rendering", {pid: pid}).then( (msg) => {return msg});
 
    if(!isRendering) {
      document.getElementById('container').classList.remove("rendering");
      break;
    }

    // Parses and filters the log file from ffmpeg in order to see how much progress has been made
    let s = await invoke("check_progress");
    s = s.split(/[\n]/).filter( line => line.includes("frame="));
    s = s.map( x => (x.replace(/\s/g,'')).split("fps=")[0].replace(/[^0-9]/gi,'') );

    if(s.length >= 1) {
      let percent = s[s.length - 1] / frame_count;
      let prog = parseFloat((percent * 100).toPrecision(2)) + "%";
      document.getElementById('connection-status').innerHTML = "Renderar video (" + prog + ") 🚀";
    }
    await sleep(250); 
  }
}

// Sets the screenshot folder path as defined by OpenSpace
async function set_screenshot_path() {
  _SCREENSHOTS_PATH_ = await get_screenshot_folder_path();
}

// Sets the video folder path to current user Video folder
async function set_video_export_path() {
  var r = await readDir("",{ dir: BaseDirectory.Home});
  r.forEach((item) => {
    if(item.name === "Videos") {
      _VIDEO_PATH_ = item.path;
    }
  })
}

// Sets the recording folder path as defined by OpenSpace
async function set_recordings_path() {
  _RECORDINGS_PATH_ = (await openspace.absPath("${RECORDINGS}"))[1];
}

// Gets the screenshot folder path (incl. the current subfolder) as defined by OpenSpace
async function get_screenshot_folder_path(){
  let rawpath = (await openspace.absPath("${SCREENSHOTS}"))[1];
  //return rawpath.replace(rawpath.slice(-17),"");
  return rawpath;
}

// Helper function that sets some HTML elements based on the state being passed
async function set_state(STATE) {
  switch (STATE) {
    case READY: 
      console.log('connected');

      document.getElementById('container').className = "connected";
      document.getElementById('connection-status').innerHTML = "Redo att köra 🛰️";
    
      document.getElementById('isDisconnected').style.display = "none";
      document.getElementById('isConnected').style.display = "block";
    
      document.getElementById("startrecording").style.display = "block";
      document.getElementById("stoprecording").style.display = "none";

      let val = await get_latest_recording();
      let file_time = val[1];
      let filewithpath = val[0];
      let filename = filewithpath.split("\\").pop();

      if(filename && file_time < MILLISECONDS_PER_DAY) {
        _ANIMAL_SUFFIX_ = filename.replace(".osrec", "");
        document.getElementById("latestFlight").innerHTML = "Senast inspelade flygturen: " + filename;
        document.getElementById("recordingsfolder").innerHTML = "📂";
        document.getElementById("createVideo").disabled = false;
      }
      else {
        document.getElementById("latestFlight").innerHTML = "Det finns inga inspelade flygningar";
        document.getElementById("createVideo").disabled = true;
      }

      document.getElementById('container').classList.remove("recording");
      document.getElementById('container').classList.remove("generating");
      document.getElementById('container').classList.remove("rendering");
      document.getElementById('container').classList.remove("outro");
      break;

    case DISCONNECTED:
      console.log("disconnected");
      document.getElementById('container').className = "disconnected";
      document.getElementById('connection-status').style.opacity = 1;
      document.getElementById('connection-status').innerHTML = "Du måste starta OpenSpace 🔧";
      
      document.getElementById('isDisconnected').style.display = "block";
      document.getElementById('isConnected').style.display = "none";
      
      document.getElementById('container').classList.remove("recording");
      document.getElementById('container').classList.remove("generating");
      document.getElementById('container').classList.remove("rendering");
      document.getElementById('container').classList.remove("outro");
      break;
  }
}

// Clears the state based on if the API is ready or not
// In other words, if OpenSpace is connected or not
async function clear_state() {
  if(openspace == null) {
    await set_state(DISCONNECTED);
  }

  if(openspace) {
    await set_state(READY);
  }
}

// Counts the number of generated frames that exists in the screenshot folder
// Used to calculate that rendering progress
async function count_frames() {
  let frame_count = await invoke("get_frame_count", {path: _SCREENSHOTS_PATH_});
  return frame_count;
}

// Returns an animal used in the suffix of the generated video
function get_animal_suffix(){
  let num = get_randon_number(_ANIMALS_.length);
  let animal = (_ANIMALS_[num].name).replace(/\s/g,'').replace(/[^0-9a-z]/gi, '');
  animal += get_randon_number(1000); //0000 - 9999 
  return animal;
}

// Loads the json object with all animals
async function load_animals() {
  _ANIMALS_ = await fetch("./animal-names.json")
.then(response => {
   return response.json();
});
}

// Random number generator used for name suffix for the video files
function get_randon_number(max) {
  return Math.floor(Math.random() * max);
}

// Combines the Username, Animal+RandomNumber in order to create a unique video file name
function name_builder(username, animalsuffix) {
  return username + "_OpenSpace_" + animalsuffix + ".mp4";
}

// Function that sets the OpenSpace UI during frame capturing (hides all UI)
async function set_openspace_ui_state(state) {
  await openspace.setPropertyValueSingle("RenderEngine.ShowVersion", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowCamera", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowLog", state);
  await openspace.setPropertyValueSingle("Dashboard.IsEnabled", state);
  await openspace.setPropertyValueSingle("Modules.CefWebGui.Visible", state);
}

// Starts the recording and sets the file name for it
async function start_recording() {
  document.getElementById("startrecording").disabled = true;
  document.getElementById("startrecording").style.display = "none";
  document.getElementById("stoprecording").style.display = "block";
  document.getElementById("createVideo").disabled = true;

  _ANIMAL_SUFFIX_ = get_animal_suffix();

  document.getElementById('container').classList.add("recording");
  document.getElementById('connection-status').innerHTML = "Inspelning pågår 🎥";

  await openspace.sessionRecording.startRecording(_ANIMAL_SUFFIX_)
}

// Stops the recording and creates an entry in the information-box
async function stop_recording() {
  await openspace.sessionRecording.stopRecording()

  await clear_state();
  document.getElementById("startrecording").disabled = false;
  document.getElementById("startrecording").style.display = "block";
  document.getElementById("stoprecording").style.display = "none";
  document.getElementById("createVideo").disabled = false;

  // Add logging to the information-box
  let filename = (await get_latest_recording())[0].split("\\").pop();
  add_to_info_box(RECORDING, filename)

  // Button animation that makes button inactive for some time
  animate_button({
    element: document.getElementById("startrecording"), 
    color_left: "#444", 
    color_right: "#333", 
    timeout_ms: 2500, 
    master: document.getElementById("createVideo")
  });

  // Remove recording states
  document.getElementById('container').classList.remove("recording");
}

// Adds new recording/video information in the information-box 
function add_to_info_box(TYPE, msg) {
 
  document.getElementById("logbox").prepend(document.createElement("br"));

  let pre = "";
  if (TYPE == VIDEO || TYPE == RECORDING) {

    let btn = document.createElement("button");
    btn.classList.add("folder");
    btn.onclick = (TYPE == VIDEO) ? () => { open_video_folder() } : () => { open_recordings_folder() };
    btn.innerHTML = "📂";

    document.getElementById("logbox").prepend(btn);

    pre = (TYPE == VIDEO) ? "Videonamn" : "Flygtursnamn";
  } else {
    pre = "Info";
  }

  let d = new Date();
  let p = document.createElement("p");
  p.classList.add("inline");
  p.innerHTML = d.toTimeString().split(' ')[0].slice(0,5) + " - " + pre + ": " + msg + " ";

  document.getElementById("logbox").prepend(p);

}

// Function to open a path in File Explorer
function open_fs(path) {
  invoke("open_fs", {path: path});
}

// Opens User Video folder in File Explorer
function open_video_folder() {
  open_fs(_VIDEO_PATH_);
}

// Opens OpenSpace screenshot folder in File Explorer
function open_screenshots_folder() {
  open_fs(_SCREENSHOTS_PATH_);
}

// Opens OpenSpace recordings folder in File Explorer
function open_recordings_folder() {
  open_fs(_RECORDINGS_PATH_);
}

// Retreives the latest recording file path+name
async function get_latest_recording() {
  return await invoke("get_latest_recording", {path: _RECORDINGS_PATH_});
}

// Generates frames based on the latest recording found
async function generate_frames() {
  document.getElementById('container').classList.add("generating");
  document.getElementById('connection-status').innerHTML = "Skapar bildsekvens 🎞️";

  // Get recording path and check if recording exists
  let retval = await get_latest_recording();
  let filewithpath = retval[0];

  if(!filewithpath) {
    alert("VARNING: Du måste spela in en flygtur först 🚀");
    return;
  }

  // Set recording frame rate
  await openspace.sessionRecording.enableTakeScreenShotDuringPlayback(60);

  // Deletes previously generated frames
  await invoke("nuke_screenshots_folder", {screenshotfolderpath: _SCREENSHOTS_PATH_});

  // Reset screenshot counter
  let DID_RESET = false;
  try {
    // Try using API, but if User is using older OpenSpace version we do fallback
    await openspace.resetScreenshotNumber();
    DID_RESET = true;
    _STARTING_INDEX_ = Number.MAX_SAFE_INTEGER;
  } catch (e) {
    DID_RESET = false;
  }
  

  // Turns of UI and starts rendering of frames
  await set_openspace_ui_state(false);
  await openspace.sessionRecording.startPlayback(filewithpath, false);

  // Loop and updates UI when the frame generation is complete
  while(true) {
    let isplaying = (await openspace.sessionRecording.isPlayingBack())[1];
    if (!isplaying) {
      if(!DID_RESET) {
        // resetScreenshotNumber function did not exist, do workaround for older OpenSpace versions
        let files = await invoke("get_screenshot_names", {screenshotfolderpath: _SCREENSHOTS_PATH_});
        let reg = /((^OpenSpace_))(([0-9]{6}))(.png$)/g
    
        files.forEach( f => {
          if(f.match(reg)) {
            let n = Number(f.replace(/\D/g, ''));
            if (n < _STARTING_INDEX_) {
              _STARTING_INDEX_ = n;
            }
          }
        });
      }

      await set_openspace_ui_state(true);
      document.getElementById('container').classList.remove("generating");
      return;
    }
    await sleep(250);
  }
}

// Function that generates the unique outro and merges it with the rendered video file
async function generate_outro_and_merge() {

  document.getElementById('container').classList.add("outro");
  document.getElementById('connection-status').innerHTML = "Skapar magi 🪄🔮";

  // Gets the Username and animal+randomNumber in order to create the final video name
  let name = document.getElementById("username").value.replace(/[^a-ö\s]/gi, '');
  let prefix = (name) ? name.replace(/\s/g,'') : name = "Astronaut";
  let filename = name_builder(prefix, _ANIMAL_SUFFIX_);

  // Format todays date to "DD month YYYY"
  const date = new Date();
  const formattedDate = date.toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).replace(/ /g, ' ');

  // Calls the RUST function that generates the Outro and merges it with the rendered video
  await invoke("generate_outro_and_merge", {username: name, filename: filename, date: formattedDate});

  // Add logging information in the Information-box
  add_to_info_box(VIDEO, filename);

  // Removes the "outro" class
  document.getElementById('container').classList.remove("outro");

  // Clears the state
  await clear_state();

  // Send notification that new video is complete
  if (_NOTIFICATION_PERMISSION_GRANTED_) {
    sendNotification({ title: 'OpenSpace Video Exporter', body: 'Din film är nu klar!' });
  }
}

async function create_video() {

  // Disable buttons
  document.getElementById("startrecording").disabled = true;
  document.getElementById("stoprecording").disabled = true;
  document.getElementById("createVideo").disabled = true;
  document.getElementById("username").disabled = true;

  // Generate frames from the latest recording
  await generate_frames();

  // Create main video file based on the generated frames
  let pid = await start_ffmpeg();
  if(pid < 0) {
    alert("ERROR CREATING RUNNING FFMPEG");
    return;
  }
  await check_progress(pid);

  // Create Outro + merge
  await generate_outro_and_merge();

  // Clean-up
  await invoke("clean_up");

  // Enable buttons again
  document.getElementById("startrecording").disabled = false;
  document.getElementById("stoprecording").disabled = false;
  document.getElementById("createVideo").disabled = false;
  document.getElementById("username").disabled = false;
}

/*
* Function to animate the button color (like a progress bar), used for indicating when button will be enabled again  
* Parameters....
*   elem: The button html element that should be affected
*   colorleft: the color for the part of the progress bar that's considered 'done'
*   colorright: the color for the part of the progress bar that's considered 'not done / to go'
*   Optional - timeout_ms: the amount of time (in milliseconds) that the animation should take place over
*                 DEFAULT: 1000ms
*   Optional - color_finished: the color that the button should have when the animation is done.
*                 DEFAULT: null, the color will be whatever is defined in the CSS file
*   Optional - master: HTML element from which the button disabled status will be copied from once timeout_ms have passed
*                 DEFAULT: null, the button disabled state will not be inherited from any other element
*   Optional - enable_when_done: boolean which determines if the button should be enabled or disabled after animation is done
*                 DEFAULT: null, the button will have whatever state it has currently
*                 NOTE: master variable will override this
*/
async function animate_button({element, color_left, color_right, timeout_ms = 1000, color_finished = null, master = null, enable_when_done = null}={}) {

  if(!element || !color_left || !color_right) {
    console.error("ERROR: animate_button function called without proper arguments");
    return;
  }

  let starttime = new Date();
  var abt = setInterval( () => {
    let now = new Date();
    let diff = Math.abs(now - starttime);
    let percent = Math.round((diff/timeout_ms) * 100);
    element.style = "background: linear-gradient(to right, " + color_left + " " + percent + "%, " + color_right + " " + percent + "%);"
    if(percent >= 100) {
      clearInterval(abt);
      element.style.removeProperty("background");
      if (!color_finished) {
        element.style.setProperty("background-color", color_finished);
      }
      if(master != null) {
        element.disabled = master.disabled;
      }
      else if(enable_when_done != null) {
        elem.disabled = !enable_when_done;
      }
    }
  }, 10);
}