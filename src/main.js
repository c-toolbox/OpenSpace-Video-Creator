const { invoke, convertFileSrc } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;
const { resolveResource } = window.__TAURI__.path;
const { isPermissionGranted, requestPermission, sendNotification } = window.__TAURI__.notification;
const { TauriEvent, listen, once } = window.__TAURI__.event;

const tauriWindow = window.__TAURI__.window;

// Constant
const MINIMUM_OPENSPACE_VERSION = "0.17.0";
const RECORDING_LENGTH_AS_MILLISECONDS = (5*60 + 0) * 1000; // (minutes*60 + seconds) * 1000 (converts to milliseconds)
const MILLISECONDS_PER_DAY = 86400000;
const FRAMERATES = {
  "FPS_30": 30,
  "FPS_60": 60
}

// Global varaibles
_SCREENSHOTS_PATH_ = "";
_VIDEO_PATH_ = "";
_RECORDINGS_PATH_ = "";
_ANIMALS_ = null;
openspace = null;
_STARTING_INDEX_ = Number.MAX_SAFE_INTEGER;
_RECORDING_INTERVAL_ = null;
_FRAMERATE_ = FRAMERATES.FPS_30; // Sets 30 or 60 fps (trade-off between disk space required and video smoothness)
_ABORT_ = false;
API = null;

// States
READY = 0;
DISCONNECTED = 1;
VIDEO = 2;
RECORDING = 3;



/*
* Helper function to sleep the thread for some time
*/
const sleep = ms => new Promise(r => setTimeout(r, ms));



/*
* Helper function to connect to opensapce
*/
let connectToOpenSpace = async () => {

  // Check ffmpeg and try connecting to OpenSpace ffmpeg exists
  let exists = await invoke("check_ffmpeg_exists");
  if (exists === false) {
    enable_overlay("#d70000", "Varning: ffmpeg saknas \n Vänligen installera ffmpeg först", "yellow", "xx-large", 0.0);
    return;
  }

  // setup the api params
  API = window.openspaceApi(null, 4682);
  
  // notify users on disconnect
  API.onDisconnect( async () => {
    await set_state(DISCONNECTED);
    openspace = null;
    console.log("disconnected");
  });
  
  // notify users and map buttons when connected
  API.onConnect(async () => {

    // Create listen for close event and handle some things if we close window
    tauriWindow.getCurrent().listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async () => {
      _ABORT_ = true;
      try {
        await openspace.sessionRecording.stopPlayback();
        await openspace.sessionRecording.stopRecording();
        await set_openspace_ui_state(true);
      } catch {};
      
      enable_overlay("black", "Hejdå", "white");

      setTimeout(async () => {
        await invoke("clean_up", {screenshotfolderpath: _SCREENSHOTS_PATH_});
        tauriWindow.getCurrent().close();
      }, 4000);
    });

    // Define sessionRecording listener
    const subscribe = () => {
      _topic_ = API.startTopic('sessionRecording', {
        event: 'start_subscription',
        properties: ['mode'],
      });
      (async () => {
        for await (const data of _topic_.iterator()) {
          if(data.state === "idle" && _RECORDING_INTERVAL_ !== null) {
            stop_recording();
          }
        }
      })();
    };

    try {
      openspace = await API.library();

      // Check OpenSpace version
      let majorminorpatch = "";
      try {
        majorminorpatch = Object.values((await openspace.version())[1].Version).join(".");
      } catch {
        let path = await invoke("get_exec_path");
        path.replaceAll("\\", "/");
        path = path.slice(0, path.indexOf('bin'));
        path += "/logs/log.html";

        let logfilecontents = await invoke("get_content_as_string", {path: path});
        let start = logfilecontents.indexOf("log-message", logfilecontents.indexOf("OpenSpace Version")) + 13;
        let end = logfilecontents.indexOf("</td>", start);
        majorminorpatch = logfilecontents.substring(start,end).split(" ")[0];
      } finally {
        let result = majorminorpatch.localeCompare(MINIMUM_OPENSPACE_VERSION, undefined, { numeric: true, sensitivity: 'base' });
        if(result < 0) {
          enable_overlay("#d70000", "Uppdatera Openspace \n Du måste ha OpenSpace 0.17.0 eller nyare", "yellow", "x-large", 0.0);
          return;
        }
      }

      // Enables sessionRecording listener
      subscribe();

      // Get framerates and add them to (hidden) list
      for(let key in FRAMERATES) {
        let opt = document.createElement("option");
        opt.text = `${FRAMERATES[key]} fps`;
        opt.value = FRAMERATES[key];
        document.getElementById("dropdown_fps").append(opt);
      }
      
      // Set som initial variables
      await set_screenshot_path();
      await set_video_export_path();
      await set_recordings_path();
      await set_state(READY);

      console.log('connected');
    } 
    catch (e) {
      alert('OpenSpace library could not be loaded: Error: \n', e);
      return;
    } 
  })
  
  // connect
  API.connect();
};



/*
* Starts ffmpeg to generate main video file from generated frames
*/
async function start_ffmpeg() {

  // Early bail
  if(_ABORT_) {
    return;
  }

  let pre_status = await invoke("pre_ffmpeg").then( (res) => {return res});
  if(pre_status.includes(0)) {   
    return await invoke("start_ffmpeg", {screenshotspath: _SCREENSHOTS_PATH_, framerate: _FRAMERATE_, startindex: (_STARTING_INDEX_ == Number.MAX_SAFE_INTEGER) ? -1 : _STARTING_INDEX_ }).then( (msg) => {return msg});
  }
  else {
    console.log("Error: Something went wrong in pre_ffmpeg");
    alert("VARNING: Något gick fel, testa att starta om programmet och kör igen");
    await invoke("clean_up", {screenshotfolderpath: _SCREENSHOTS_PATH_});
    return -1;
  }
}



/*
* Checks the rendering progress for main video file from the generated frames
*/
async function check_progress(pid) {

  // Early bail
  if(_ABORT_) {
    return;
  }

  document.getElementById('container').classList.add("rendering");

  document.getElementById('connection-status').innerHTML = "Renderar video (0%) ";

  let elem = document.createElement("picture");
  elem.id = "rocket";
  document.getElementById('connection-status').append(elem);

  let path = await resolveResource("assets/rocket.png");
  let assetpath = convertFileSrc(path);
  let source = document.createElement('source');
  source.srcset = assetpath;
  source.width = "32";
  source.height = "32"
  let image = document.createElement("img");
  image.classList.add("legacy");
  elem.appendChild(source);
  elem.appendChild(image);
  

  let frame_count = await count_frames();

  while(true) {

    if(_ABORT_) {
      await invoke("abort", {pid: pid});
      break;
    }

    let isRendering = await invoke("check_if_rendering", {pid: pid}).then( (msg) => {return msg});
    if(!isRendering) {
      document.getElementById('rocket').remove();
      document.getElementById('container').classList.remove("rendering");
      document.getElementById('connection-status').innerHTML = "Tänker...";
      break;
    }

    // Parses and filters the log file from ffmpeg in order to see how much progress has been made
    let s = await invoke("check_progress");
    s = s.split(/[\n]/).filter( line => line.includes("frame="));
    s = s.map( x => (x.replace(/\s/g,'')).split("fps=")[0].replace(/[^0-9]/gi,'') );

    if(s.length >= 1) {
      let percent = s[s.length - 1] / frame_count;
      let prog = parseInt((percent * 100).toPrecision(2)) + "%";

      document.getElementById('connection-status').innerHTML = `Renderar video (${prog})`;
      document.getElementById('connection-status').append(elem);

      elem.appendChild(source);
      elem.appendChild(image);
    }
    await sleep(250); 
  }
}



/*
* Sets abort flag for Frame Generation and Rendering steps
*/
function abort() {
  _ABORT_ = true;
}

/*
* Sets the screenshot folder path as defined by OpenSpace
*/
async function set_screenshot_path() {
  _SCREENSHOTS_PATH_ = await get_screenshot_folder_path();
}



/*
* Sets the video folder path to current user Video folder
*/
async function set_video_export_path() {
  var r = await readDir("",{ dir: BaseDirectory.Home});
  r.forEach((item) => {
    if(item.name === "Videos") {
      _VIDEO_PATH_ = item.path;
    }
  })
}



/*
* Sets the recording folder path as defined by OpenSpace
*/
async function set_recordings_path() {
  _RECORDINGS_PATH_ = (await openspace.absPath("${RECORDINGS}"))[1];
}



/*
* Gets the screenshot folder path (incl. the current subfolder) as defined by OpenSpace
*/
async function get_screenshot_folder_path(){
  let rawpath = (await openspace.absPath("${SCREENSHOTS}"))[1];
  //return rawpath.replace(rawpath.slice(-17),"");
  return rawpath;
}



/*
* Helper function that sets some HTML elements based on the state being passed
*/
async function set_state(STATE) {
  switch (STATE) {
    case READY: 
      document.getElementById('container').className = "connected";
      document.getElementById('connection-status').innerHTML = "";

      let p_elem = document.createElement("p");
      p_elem.innerText = "Redo att köra ";
      document.getElementById('connection-status').append(p_elem);

      let r_elem = document.createElement("picture");
      r_elem.id = "satellite";
      document.getElementById('connection-status').append(r_elem);
  
      let r_path = await resolveResource("assets/satellite.png");
      let r_assetpath = convertFileSrc(r_path);
      let r_source = document.createElement('source');
      r_source.srcset = r_assetpath;
      r_source.width = "20";
      r_source.height = "20"
      let r_image = document.createElement("img");
      r_image.classList.add("legacy");
      r_elem.appendChild(r_source);
      r_elem.appendChild(r_image);
      
      document.getElementById('isDisconnected').style.display = "none";
      document.getElementById('isConnected').style.display = "block";
    
      document.getElementById("startrecording").style.display = "inline";
      document.getElementById("stoprecording").style.display = "none";
      document.getElementById("abort").style.display = "none";
      document.getElementById("createVideo").style.display = "inline";

      let elements = document.getElementsByClassName("interactives");
      for (let e of elements) {
        e.disabled = false;
      }

      // Get all recordings and the already listed
      let recordings = await get_all_recordings();
      let listedrecordings = document.getElementById("dropdown_flights").children;

      // Try-catch instead of multiple (recordings.length > 0)
      try {
        // Rank them from newest to oldest
        recordings.sort(function(a,b){
          return Number(a[1]) - Number(b[1]);
        });

        // Mark all recordings that are older than 24hours
        // Change all backslash to forwardslash
        let todelete = [];
        for(let i = 0; i < recordings.length; ++i) {
          if(Number(recordings[i][1]) > MILLISECONDS_PER_DAY) {
            todelete.push(i);
          }
          recordings[i][0] = recordings[i][0].slice(recordings[i][0].lastIndexOf("\\")).replace("\\","");
        }

        // Remove all marked recordings
        for(let i = todelete.length - 1; i >= 0; --i) {
          recordings.splice(todelete[i],1);
        }

        var update = true;
        if(listedrecordings.length == recordings.length) {
          // Compare to the already listed ones to see if we need to update or not
          // We do this so that selected recording is not reset each call
          recordings.every( (e,i) => {
          if(e[0] !== listedrecordings[i].value) {
            update = true;
            return false;
          } 
          else {
            update = false;
          }
        });
        }

        // Set some variables related to file names and paths
        let filewithpath = recordings[0][0];
        var file_time = recordings[0][1];
        var filename = filewithpath.split("/").pop();
      } 
      catch {
        document.getElementById("dropdown_flights").style.display = "none";
      }

      // Only proceed if we have a filename and if it's modified date is within 24h
      if(filename && file_time < MILLISECONDS_PER_DAY) {
        document.getElementById("dropdown_flights").style.display = "inline";
        document.getElementById("latestFlight").innerHTML = "Senast inspelade flygturen: ";

        if(update) {
          // Remove previous instance of options in dropdown
          document.getElementById("dropdown_flights").replaceChildren("");

          // Populate dropdown menu
          recordings.forEach( rec => {
          let opt = document.createElement("option");
          opt.value = rec[0];
          opt.text = opt.value.split("/").pop().split(".osrec")[0];
          document.getElementById("dropdown_flights").append(opt);
        });
        }

        var path = await resolveResource("assets/folder.png");
        var assetpath = convertFileSrc(path);
        document.getElementById("recordingsfolder").style.setProperty("background", `url(${assetpath})`);
        document.getElementById("recordingsfolder").style.setProperty("background-size", "20px");
        document.getElementById("recordingsfolder").style.setProperty("background-position", "0px 0px");
        document.getElementById("recordingsfolder").style.setProperty("background-repeat", "no-repeat");
        document.getElementById("recordingsfolder").classList.add("legacyfolder");
        
        document.getElementById("createVideo").disabled = false;
      }
      else {
        document.getElementById("latestFlight").innerHTML = "Det finns inga inspelade flygningar";
        document.getElementById("createVideo").disabled = true;
        document.getElementById("startplayback").disabled = true;
      }

      document.getElementById('container').classList.remove("recording");
      document.getElementById('container').classList.remove("generating");
      document.getElementById('container').classList.remove("rendering");
      document.getElementById('container').classList.remove("outro");
      break;

    case DISCONNECTED:

      if(_SCREENSHOTS_PATH_ !== "") {
        await invoke("clean_up", {screenshotfolderpath: _SCREENSHOTS_PATH_});
      }

      document.getElementById('container').className = "disconnected";
      document.getElementById('connection-status').style.opacity = 1;
      document.getElementById('connection-status').innerHTML = "";
            
      let p = document.createElement("p");
      p.innerHTML = "Du måste starta OpenSpace ";
      document.getElementById('connection-status').append(p);

      let d_elem = document.createElement("picture");
      d_elem.id = "wrench";
      document.getElementById('connection-status').append(d_elem);

      const d_path = await resolveResource("assets/wrench.png");
      const d_assetpath = convertFileSrc(d_path);
      const d_source = document.createElement('source');
      d_source.srcset = d_assetpath;
      d_source.width = "20";
      d_source.height = "20"
      const d_image = document.createElement("img");
      d_image.classList.add("legacy");
      d_elem.appendChild(d_source);
      d_elem.appendChild(d_image);

      
      document.getElementById('isDisconnected').style.display = "block";
      document.getElementById('isConnected').style.display = "none";
      
      document.getElementById('container').classList.remove("recording");
      document.getElementById('container').classList.remove("generating");
      document.getElementById('container').classList.remove("rendering");
      document.getElementById('container').classList.remove("outro");
      break;
  }
}



/*
* Clears the state based on if the API is ready or not
* In other words, if OpenSpace is connected or not
*/
async function clear_state() {
  if(openspace == null) {
    await set_state(DISCONNECTED);
  }

  if(openspace) {
    await set_state(READY);
  }
}



/*
* Counts the number of generated frames that exists in the screenshot folder
* Used to calculate that rendering progress
*/
async function count_frames() {
  let frame_count = await invoke("get_frame_count", {path: _SCREENSHOTS_PATH_});
  return frame_count;
}



/*
* Returns an animal used in the suffix of the generated video
*/
function get_random_animal(){
  let num = get_randon_number(_ANIMALS_.length);
  let animal = (_ANIMALS_[num].name).replace(/\s/g,'').replace(/[^0-9a-z]/gi, '');
  animal += get_randon_number(1000); //0000 - 9999 
  return animal;
}



/*
* Loads the json object with all animals
*/
async function load_animals() {
  _ANIMALS_ = await fetch("./animal-names.json")
.then(response => {
   return response.json();
});
}



/*
* Random number generator used for name suffix for the video files
*/
function get_randon_number(max) {
  return Math.floor(Math.random() * max);
}



/*
* Combines the Username, Animal+RandomNumber in order to create a unique video file name
*/
function name_builder(username, animalsuffix) {
  return `${username}_OpenSpace_${animalsuffix}.mp4`;
}



/*
* Sets OpenSpace UI during frame capturing (hides all UI)
*/
async function set_openspace_ui_state(state) {
  await openspace.setPropertyValueSingle("RenderEngine.ShowVersion", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowCamera", state);
  await openspace.setPropertyValueSingle("RenderEngine.ShowLog", state);
  await openspace.setPropertyValueSingle("Dashboard.IsEnabled", state);
  await openspace.setPropertyValueSingle("Modules.CefWebGui.Visible", state);
}



/*
* Starts the recording and sets the file name for it
*/
async function start_recording() {
  let elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = true;
  }

  document.getElementById("stoprecording").disabled = false;
  document.getElementById("startrecording").style.display = "none";
  document.getElementById("stoprecording").style.display = "inline";
  


  let recordingname = get_random_animal();

  document.getElementById('container').classList.add("recording");
  document.getElementById('connection-status').innerHTML = "Inspelning pågår ";

  let elem = document.createElement("picture");
  elem.id = "moviecamera";
  document.getElementById('connection-status').append(elem);

  const path = await resolveResource("assets/moviecamera.png");
  const assetpath = convertFileSrc(path);
  const source = document.createElement('source');
  source.srcset = assetpath;
  source.width = "36";
  source.height = "36"
  const image = document.createElement("img");
  image.classList.add("legacy");
  elem.appendChild(source);
  elem.appendChild(image);
  
  // Start recording
  await openspace.sessionRecording.startRecording(recordingname)

  // Get initial time
  let then = new Date();
  let now = new Date();

  // Update IU counter
  if (!document.getElementById("timelimit").checked) {
    let diff = (RECORDING_LENGTH_AS_MILLISECONDS-(now-then))/1000;
    let seconds_text = ('0'+(Math.floor(diff%60))).slice(-2);
    document.getElementById("stoprecording").innerHTML = `Stoppa inspelning (${Math.floor(diff/60)}:${seconds_text})`;
  
    _RECORDING_INTERVAL_ = setInterval(() => {
      let now = new Date();
      if(now-then > RECORDING_LENGTH_AS_MILLISECONDS) {
        stop_recording();
      }
  
      let diff = (RECORDING_LENGTH_AS_MILLISECONDS-(now-then))/1000;
      let seconds_text = ('0'+(Math.floor(diff%60))).slice(-2);
      document.getElementById("stoprecording").innerHTML = `Stoppa inspelning (${Math.floor(diff/60)}:${seconds_text})`;
    }, 250);
  }
  else {
    document.getElementById("stoprecording").innerHTML = "Stoppa inspelning";
  }
}



/*
* Stops the recording and creates an entry in the information-box
*/
async function stop_recording() {
  let elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = false;
  }
 
  document.getElementById("startrecording").disabled = true;
  document.getElementById("startrecording").style.display = "inline";
  document.getElementById("stoprecording").style.display = "none";

  clearInterval(_RECORDING_INTERVAL_);
  _RECORDING_INTERVAL_ = null;

  await openspace.sessionRecording.stopRecording()

  await clear_state();

  if(_ABORT_ == false) {
    // Add logging to the information-box
    let filename = document.getElementById("dropdown_flights").value.split("/").pop();
    await add_to_info_box(RECORDING, filename)
  }

  // Button animation that makes button inactive for some time
  animate_button({
    element: document.getElementById("startrecording"), 
    color_left: "#444", 
    color_right: "#333", 
    timeout_ms: 2500, 
    disable_on_click: true,
    master: document.getElementById("createVideo")
  });


  // Remove recording states
  document.getElementById('container').classList.remove("recording");
}



/*
* Start playback of the selected recording
*/
async function start_playback() {
  
  // Disable all buttons
  let elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = true;
  }
  
  // Enable stop flying and hide the start flying button
  document.getElementById("stopplayback").disabled = false;
  document.getElementById("startplayback").style.display = "none";
  document.getElementById("stopplayback").style.display = "inline";

  // Set status messages
  document.getElementById('container').classList.add("playback");
  document.getElementById('connection-status').innerHTML = "Spelar upp din flygtur ";

  let elem = document.createElement("picture");
  elem.id = "popcorn";
  document.getElementById('connection-status').append(elem);

  const path = await resolveResource("assets/popcorn.png");
  const assetpath = convertFileSrc(path);
  const source = document.createElement('source');
  source.srcset = assetpath;
  source.width = "36";
  source.height = "36"
  const image = document.createElement("img");
  image.classList.add("legacy");
  elem.appendChild(source);
  elem.appendChild(image);

  // Set playback settings
  await openspace.sessionRecording.disableTakeScreenShotDuringPlayback();
  await openspace.sessionRecording.startPlayback(document.getElementById("dropdown_flights").value);

  // Check if it's done
  while(true) {
    if( !(await openspace.sessionRecording.isPlayingBack())[1]) {
      stop_playback();
      break;
    }

    await sleep(250);
  }
}



/*
* Start playback of the selected recording
*/
async function stop_playback() {

  // Aborts playback
  await openspace.sessionRecording.stopPlayback();

  // Enable all buttons
  let elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = false;
  }
  
  // Switch buttons
  document.getElementById("startplayback").style.display = "inline";
  document.getElementById("stopplayback").style.display = "none";

  // Remove class
  document.getElementById('container').classList.remove("playback");

  // Reset things
  await clear_state();
}



/*
* Adds new recording/video information in the information-box 
*/
async function add_to_info_box(TYPE, msg) {
 
  document.getElementById("logbox").prepend(document.createElement("br"));

  let pre = "";
  if (TYPE == VIDEO || TYPE == RECORDING) {

    let btn = document.createElement("button");
    btn.onclick = (TYPE == VIDEO) ? () => { open_video_folder() } : () => { open_recordings_folder() };
    var path = await resolveResource("assets/folder.png");
    var assetpath = convertFileSrc(path);
    btn.style.setProperty("background", `url(${assetpath})`);
    btn.style.setProperty("background-size", "20px");
    btn.style.setProperty("background-position", "0px 0px");
    btn.style.setProperty("background-repeat", "no-repeat");
    btn.classList.add("legacyfolder");
    
    document.getElementById("logbox").prepend(btn);

    pre = (TYPE == VIDEO) ? "Videonamn" : "Flygtursnamn";
  } else {
    pre = "Info";
  }

  let d = new Date();
  let p = document.createElement("p");
  p.classList.add("inline");
  p.innerHTML = `${d.toTimeString().split(' ')[0].slice(0,5)} - ${pre}: ${msg} `;

  document.getElementById("logbox").prepend(p);

}



/*
* Function to open a path in File Explorer
*/
function open_fs(path) {
  invoke("open_fs", {path: path});
}



/*
* Opens User Video folder in File Explorer
*/
function open_video_folder() {
  open_fs(_VIDEO_PATH_);
}



/*
* Opens OpenSpace screenshot folder in File Explorer
*/
function open_screenshots_folder() {
  open_fs(_SCREENSHOTS_PATH_);
}



/*
* Opens OpenSpace recordings folder in File Explorer
*/
function open_recordings_folder() {
  open_fs(_RECORDINGS_PATH_);
}



/*
* Retreives all recordings in the recordings folder 
* Format: Vec<Vec<String>> where the most nested Vec has length 2 
*         (0: path+name, 1: When it was created in milliseconds_since_now)
*/
async function get_all_recordings() {
  return await invoke("get_all_recordings", {path: _RECORDINGS_PATH_});
}



/*
* Generates frames based on the latest recording found
*/
async function generate_frames() {

  // Early bail
  if(_ABORT_) {
    return;
  }

  document.getElementById('container').classList.add("generating");
  document.getElementById('connection-status').innerHTML = "";

  let p_elem = document.createElement("p");
  p_elem.id = "generatingprogress"
  p_elem.innerText = "Skapar bildsekvens";
  document.getElementById('connection-status').append(p_elem);

  let elem = document.createElement("picture");
  elem.id = "frames";
  document.getElementById('connection-status').append(elem);

  const path = await resolveResource("assets/frames.png");
  const assetpath = convertFileSrc(path);
  const source = document.createElement('source');
  source.srcset = assetpath;
  source.width = "36";
  source.height = "36"
  const image = document.createElement("img");
  image.classList.add("legacy");
  elem.appendChild(source);
  elem.appendChild(image);

  // Get recording path and check if recording exists
  let filewithpath = document.getElementById("dropdown_flights").value;

  if(!filewithpath) {
    alert("VARNING: Du måste spela in en flygtur först");
    return;
  }

  // Set recording frame rate
  _FRAMERATE_ = Number(document.getElementById("dropdown_fps").value);
  await openspace.sessionRecording.enableTakeScreenShotDuringPlayback(_FRAMERATE_);

  // Reset screenshot counter
  let DID_RESET = false;
  try {
    // Try using API, but if User is using older OpenSpace version we do fallback
    await openspace.resetScreenshotNumber();
    DID_RESET = true;
  } catch (e) {
    DID_RESET = false;
    _STARTING_INDEX_ = Number.MAX_SAFE_INTEGER;
  }
  

  // Turns of UI and starts rendering of frames
  await set_openspace_ui_state(false);
  await openspace.sessionRecording.startPlayback(filewithpath, false);

  // Loop and updates UI when the frame generation is complete
  while(true) {
    if(_ABORT_) {
      await openspace.sessionRecording.stopPlayback();
      
      // We need to sleep as some data may still be in state of being written, 
      // so calling clean_up to early will miss some things
      await sleep(2500);
      await invoke("clean_up", {screenshotfolderpath: _SCREENSHOTS_PATH_});
      
      await set_openspace_ui_state(true);
      break;
    }

    let t = document.getElementById("generatingprogress").innerText;
    let n = (t.length % 3) + 1;
    document.getElementById("generatingprogress").innerText = `Skapar bildsekvens${[...Array(n).fill(".")].join("")}`;

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

      document.getElementById('frames').remove();
      document.getElementById('container').classList.remove("generating");
      document.getElementById('connection-status').innerHTML = "Tänker...";
      await set_openspace_ui_state(true);
      return;
    }
    await sleep(250);
  }
}



/*
* Function that generates the unique outro and merges it with the rendered video file
*/
async function generate_outro_and_merge() {

  // Early bail
  if(_ABORT_) {
    return;
  }

  document.getElementById('container').classList.add("outro");

  document.getElementById('connection-status').innerHTML = "Skapar magi ";

  let e1 = document.createElement("picture");
  let e2 = document.createElement("picture");
  e1.id = "wand";
  e2.id = "crystalball";
  document.getElementById('connection-status').append(e1);
  document.getElementById('connection-status').append(e2);

  const p1 = await resolveResource("assets/wand.png");
  const a1 = convertFileSrc(p1);
  const s1 = document.createElement('source');
  s1.srcset = a1;
  s1.width = "36";
  s1.height = "36"
  const i1 = document.createElement("img");
  i1.classList.add("legacy");
  e1.appendChild(s1);
  e1.appendChild(i1);

  const p2 = await resolveResource("assets/crystalball.png");
  const a2 = convertFileSrc(p2);
  const s2 = document.createElement('source');
  s2.srcset = a2;
  s2.width = "36";
  s2.height = "36"
  const i2 = document.createElement("img");
  i2.classList.add("legacy");
  e2.appendChild(s2);
  e2.appendChild(i2);
  

  // Gets the Username and animal+randomNumber in order to create the final video name
  let e = document.getElementById("dropdown_flights");
  let name = document.getElementById("username").value.replace(/[^a-ö\s]/gi, '');
  let prefix = (name) ? name.replace(/\s/g,'') : name = "Astronaut";
  let animalsuffix = e[e.options.selectedIndex].text;
  let filename = name_builder(prefix, animalsuffix);
  
  // Flag to see if outro should be created or not
  let outroflag = document.getElementById("removeoutro").checked;

  // Format todays date to "DD month YYYY"
  const date = new Date();
  const formattedDate = date.toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).replace(/ /g, ' ');

  // Calls the RUST function that generates the Outro and merges it with the rendered video
  await invoke("generate_outro_and_merge", {username: name, filename: filename, date: formattedDate, framerate: _FRAMERATE_, flag: outroflag});

  // Add logging information in the Information-box
  await add_to_info_box(VIDEO, filename);

  // Removes some classes
  document.getElementById('wand').remove();
  document.getElementById('crystalball').remove();
  document.getElementById('container').classList.remove("outro");
  document.getElementById('connection-status').innerHTML = "Tänker...";
}



/*
* Main function that calls all parts to create the video
*/
async function create_video() {
  document.getElementById('container').classList.add("working");

  // Show abort button and hide Create Video button
  document.getElementById("abort").style.display = "inline";
  document.getElementById("createVideo").style.display = "none";

  // Disable buttons
  let elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = true;
  }

  // Generate frames from the latest recording
  await generate_frames();

  // Create main video file based on the generated frames
  let pid = await start_ffmpeg();
  if(pid == -1) {
    alert("Ffmpeg failed to start");
    return;
  }
  await check_progress(pid);

  // Create Outro + merge
  await generate_outro_and_merge();

  // Clean-up
  await invoke("clean_up", {screenshotfolderpath: _SCREENSHOTS_PATH_});
  
  // Clears the state
  await clear_state();

  // Send notification that new video is complete
  if (_NOTIFICATION_PERMISSION_GRANTED_ && !_ABORT_) {
    sendNotification({ title: 'OpenSpace Video Exporter', body: 'Din film är nu klar!' });
  }

  document.getElementById('container').classList.remove("working");

  // Enable buttons again
  elements = document.getElementsByClassName("interactives");
  for (let e of elements) {
    e.disabled = false;
  }

  // Hide abort button and show Create Video button again
  document.getElementById("abort").style.display = "none";
  document.getElementById("createVideo").style.display = "inline";
  _ABORT_ = false;
}


/*
* Enables the overlay and sets a message
*/
async function enable_overlay(backgroundcolor = "black", text = "", textcolor = "white", fontsize = "xx-large", fadespeed = 1.0) {

  // Set initial things
  document.getElementById("overlaytext").style.color = "transparent";
  document.getElementById("overlaytext").innerText = "";
  await sleep(50);

  // Begin
  document.getElementById("overlay").style.transition = `all ${2 * fadespeed}s`;
  document.getElementById("overlaytext").style.transition = `all ${1 * fadespeed}s`;

  document.getElementById("overlaytext").innerText = text;

  document.getElementById("overlay").style.display = "flex";
  document.getElementById("overlaytext").style.display = "block";
  document.getElementById("overlaytext").style.fontSize = fontsize;
  await sleep(50); // Need to sleep so we don't set overlay display flex and background in same frame
  document.getElementById("overlay").style.background = backgroundcolor;
  
  setTimeout(async () => {
    document.getElementById("overlaytext").style.color = textcolor          
  }, 2000 * fadespeed);
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
*   Optional - disable_on_click: boolean which determines if the button should be enabled or disabled when clicked
*                 default: false
*   Optional - enable_when_done: boolean which determines if the button should be enabled or disabled after animation is done
*                 DEFAULT: null, the button will have whatever state it has currently
*                 NOTE: master variable will override this
*/
async function animate_button({element, color_left, color_right, timeout_ms = 1000, color_finished = null, master = null, disable_on_click = false, enable_when_done = null}={}) {

  if(!element || !color_left || !color_right) {
    console.error("ERROR: animate_button function called without proper arguments");
    return;
  }

  element.disabled = disable_on_click;

  let starttime = new Date();
  var abt = setInterval( () => {
    let now = new Date();
    let diff = Math.abs(now - starttime);
    let percent = Math.round((diff/timeout_ms) * 100);
    element.style = `background: linear-gradient(to right, ${color_left} ${percent}%, ${color_right} ${percent}%);`;
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
        element.disabled = !enable_when_done;
      }
    }
  }, 10);
}