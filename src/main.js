const { invoke, convertFileSrc } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;
const { resolveResource } = window.__TAURI__.path;
const { isPermissionGranted, requestPermission, sendNotification } = window.__TAURI__.notification;
const { getVersion } = window.__TAURI__.app;
const { TauriEvent, listen, once } = window.__TAURI__.event;

const tauriWindow = window.__TAURI__.window;

// Constant
const MINIMUM_OPENSPACE_VERSION = "0.17.0";
const RECORDING_LENGTH_AS_MILLISECONDS = (10*60 + 0) * 1000; // (minutes*60 + seconds) * 1000 (converts to milliseconds)
const RECORDING_HIDE_TIMER_IN_MILLISECONDS = 43200000;
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
* Function to connect to opensapce
*/
let connectToOpenSpace = async () => {

  // Set app version
  document.getElementById("appversion").innerHTML = `App Version: ${await getVersion()}`;

  // setup the api params
  API = window.openspaceApi(null, 4682);

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
      
      enable_overlay("black", "Hejdå");

      setTimeout(async () => {
        await invoke("clean_all", {screenshotfolderpath: _SCREENSHOTS_PATH_});
        tauriWindow.getCurrent().close();
      }, 4000);
    });

    try {
      openspace = await API.library();
      
      // Check OpenSpace version
      await assert_openspace_version(MINIMUM_OPENSPACE_VERSION);
      
      // Define sessionRecording listener
      const subscribe_to_sessionRecording_topic = create_topic_subscription (
        "sessionRecording",
        "start_subscription",
        ['state'], 
        (data) => {
          if(data.state === "idle" && _RECORDING_INTERVAL_ !== null) {
            stop_recording();
          }
        }
      );

      // Enables sessionRecording listener
      subscribe_to_sessionRecording_topic();

      // Get framerates and add them to (hidden) list
      document.getElementById("dropdown_fps").length = 0;
      for(let key in FRAMERATES) {
        let opt = document.createElement("option");
        opt.text = `${FRAMERATES[key]} fps`;
        opt.value = FRAMERATES[key];
        document.getElementById("dropdown_fps").append(opt);
      }

      // Create eventlistener for showing all recordings
      document.getElementById("showallrecordings").addEventListener('change', async () => {
        set_state(READY)
      })

      // set openspace screenshot path other than default location
      await set_openspace_screenshot_folder("temp");

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
  });

    
  // notify users on disconnect
  API.onDisconnect( async () => {
    await set_state(DISCONNECTED);
    openspace = null;
    console.log("disconnected");
  });

  
  // starts connection attempt
  API.connect();
};



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

  // Generate frames and create video with (or without) outro
  await render();

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



/*##########################################################################
#                                                                          #
#    BELOW FOLLOWS FUNCTIONS THAT ARE CALLED FROM CREATE_VIDEO FUNCTION    #
#    BELOW FOLLOWS FUNCTIONS THAT ARE CALLED FROM CREATE_VIDEO FUNCTION    #
#    BELOW FOLLOWS FUNCTIONS THAT ARE CALLED FROM CREATE_VIDEO FUNCTION    #
#                                                                          #
###########################################################################*/



/*
* Render function that generates frames and creates the video in chunks.
*/
async function render() {

  // Early bail
  if(_ABORT_) {
    return;
  }
  
  // Need to set UI stuff here
  document.getElementById('container').classList.add("rendering");
  document.getElementById('connection-status').innerHTML = "";

  let p_elem = document.createElement("p");
  p_elem.id = "generatingprogress"
  p_elem.innerText = "Skapar din video.";
  document.getElementById('connection-status').append(p_elem);

  await add_picture_element("moviecamera", "connection-status", "assets/moviecamera.png", 36, 36, "legacy");

  // Clean
  await invoke("clean_all", {screenshotfolderpath: _SCREENSHOTS_PATH_});

  // Get recording path and check if recording exists
  let filewithpath = document.getElementById("dropdown_flights").value;
  if(!filewithpath) {
    alert("VARNING: Du måste spela in en flygtur först");
    return;
  }

  // Set recording parameters and reset counter
  _FRAMERATE_ = Number(document.getElementById("dropdown_fps").value);
  await openspace.sessionRecording.enableTakeScreenShotDuringPlayback(_FRAMERATE_);
  
  // Reset screenshot counter
  let DID_RESET = false;
  var idx = -1;
  try {
    // Try using API, but if User is using older OpenSpace version we do fallback
    await openspace.resetScreenshotNumber();
    DID_RESET = true;
    idx = 0;
  } catch (e) {
    DID_RESET = false;
  }

  // Define an interval function that creates the ticking dots in the information text
  let ticker = setInterval(() => {
    let t = ((document.getElementById("generatingprogress").innerText.match(/\./g)) || []).length;
    let n = (t % 4) + 1;
    document.getElementById("generatingprogress").innerText = `Skapar din video${[...Array(n).fill(".")].join("")}`;
  }, 500);

  // Create timer variables and auxillary variables used in the main rendering loop
  let start = new Date();
  let now = new Date();
  let pid = null;
  let firstRun = true;

  // Hide Openspace UI and start recording
  await set_openspace_ui_state(false);
  await openspace.sessionRecording.startPlayback(filewithpath, false);

  // Main rendering loop
  while( _ABORT_ == false) {
    now = new Date();

    // Checks if we've generated enough or all available frames before continuing 
    if (now - start > 5000 || (await openspace.sessionRecording.isPlayingBack())[1] == false) {
      
      // Pause the frame generation (playback)
      await openspace.sessionRecording.setPlaybackPause(true);
      
      // Sets screenshot starting index (to be passed to ffmpeg)
      if (!DID_RESET) {
        idx = await get_screenshot_starting_index();
      } else {
        await openspace.resetScreenshotNumber();
        idx = 0;
      }
      
      // Renders the sequence based on the generated frames
      pid = await invoke("render_sequence", {filename: "osv_chunk", screenshotspath: _SCREENSHOTS_PATH_, framerate: _FRAMERATE_, startindex: idx}).then( (msg) => {return msg});
      while(true) {

        if(_ABORT_) {
          await invoke("abort", {pid: pid});
          break;
        }
        
        // Check if ffmpeg is still rendering the video file
        let isRendering = await invoke("check_if_rendering", {pid: pid}).then( (msg) => {return msg});

        if(!isRendering) {
          break;
        }
        
        await sleep(100); 
      }

      // Special case if it's our first rendered sequence
      // We rename it to osv so that it can either be used for merge with next chunk or
      // be used as the final video before being merged with the outro
      if (firstRun) {
        await invoke("rename_sequence", {filename: "osv_chunk", newname: "osv"});
        firstRun = false;
      }
      else {
        // Merges the previous video with the new chunk
        await invoke("rename_sequence", {filename: "osv", newname: "osv_progress"});
        await invoke("merge", {progressname: "osv_progress", chunkname: "osv_chunk", outputname: "osv"});
      }

      // Cleans up the old frames
      await invoke("clean_some", {screenshotfolderpath: _SCREENSHOTS_PATH_});
      
      // Sets new timer and starts playback again
      start = new Date();
      await openspace.sessionRecording.setPlaybackPause(false);
    }

    // Breaks the loop if the recording is done
    if( (await openspace.sessionRecording.isPlayingBack())[1] == false) {
      break;
    }

    await sleep(50);
  }

  // Cleans up and resets states if we abort during the rendering
  if (_ABORT_) {
    await openspace.sessionRecording.stopRecording();
    await openspace.sessionRecording.stopPlayback();
    await sleep(500);
    await set_openspace_ui_state(true)
    await invoke("clean_all", {screenshotfolderpath: _SCREENSHOTS_PATH_});
    document.getElementById('moviecamera').remove();
    document.getElementById('container').classList.remove("rendering");
    clearInterval(ticker);
    return;
  }

  // Generate and merge outro
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

  //Clean up and resets states
  await invoke("clean_all", {screenshotfolderpath: _SCREENSHOTS_PATH_});
  await set_openspace_ui_state(true)
  document.getElementById('moviecamera').remove();
  document.getElementById('container').classList.remove("rendering");
  clearInterval(ticker);
}



/*
* Function that generates the unique outro and merges it with the rendered video file
*/
async function generate_outro_and_merge() {

  // Early bail
  if(_ABORT_) {
    return;
  }

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

      await add_picture_element("satellite", "connection-status", "assets/satellite.png", 20, 20, "legacy");
      
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

      // Check if we should show all recordings or not
      let showall = document.getElementById("showallrecordings").checked;

      // Try-catch instead of multiple (recordings.length > 0)
      try {
        // Rank them from newest to oldest
        recordings.sort(function(a,b){
          return Number(a[1]) - Number(b[1]);
        });

        // Mark all recordings that are older than 12 hours (unless Easter Egg option to show all is checked)
        let todelete = [];
        for(let i = 0; i < recordings.length; ++i) {
          if(!showall && Number(recordings[i][1]) > RECORDING_HIDE_TIMER_IN_MILLISECONDS) {
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

      // Only proceed if we have a filename and if it's modified date is within 12 hours
      if(filename && (file_time < RECORDING_HIDE_TIMER_IN_MILLISECONDS || showall)) {
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
        document.getElementById("recordingsfolder").style.display = "inline";
        
        document.getElementById("createVideo").disabled = false;
      }
      else {
        document.getElementById("latestFlight").innerHTML = "Det finns inga inspelade flygningar";
        document.getElementById("createVideo").disabled = true;
        document.getElementById("startplayback").disabled = true;
        document.getElementById("recordingsfolder").style.display = "none";
      }

      let rm1 = ["recording", "rendering"]
      document.getElementById('container').classList.remove(...rm1);
      break;

    case DISCONNECTED:

      if(_SCREENSHOTS_PATH_ !== "") {
        await invoke("clean_all", {screenshotfolderpath: _SCREENSHOTS_PATH_});
      }

      document.getElementById('container').className = "disconnected";
      document.getElementById('connection-status').style.opacity = 1;
      document.getElementById('connection-status').innerHTML = "";
            
      let p = document.createElement("p");
      p.innerHTML = "Du måste starta OpenSpace ";
      document.getElementById('connection-status').append(p);

      await add_picture_element("wrench", "connection-status", "assets/wrench.png", 20, 20, "legacy");
      
      document.getElementById('isDisconnected').style.display = "block";
      document.getElementById('isConnected').style.display = "none";
      
      let rm2 = ["recording", "rendering"]
      document.getElementById('container').classList.remove(...rm2)
      break;
  }
}



/*##################################################
#                                                  #
#   FUNCTIONS RELATED TO, OR CALLED BY, THE GUI    #
#   FUNCTIONS RELATED TO, OR CALLED BY, THE GUI    #
#   FUNCTIONS RELATED TO, OR CALLED BY, THE GUI    #
#                                                  #
###################################################*/



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
  
  document.getElementById('container').classList.add("recording");
  document.getElementById('connection-status').innerHTML = "Inspelning pågår ";

  await add_picture_element("moviecamera", "connection-status", "assets/moviecamera.png", 36, 36, "legacy");
  
  // Start recording
  let recordingname = get_random_animal();
  await openspace.sessionRecording.startRecording(recordingname)

  // Get initial time
  let starttime = new Date();

  // Update IU counter
  if (!document.getElementById("timelimit").checked) {

    let left = time_left(starttime, RECORDING_LENGTH_AS_MILLISECONDS)
    let minutes_text = left.minutes;
    let seconds_text = ('0'+left.seconds).slice(-2);
    document.getElementById("stoprecording").innerHTML = `Stoppa inspelning (${minutes_text}:${seconds_text})`;
  
    _RECORDING_INTERVAL_ = setInterval(() => {
      let left = time_left(starttime, RECORDING_LENGTH_AS_MILLISECONDS)

      if(left.minutes == 0 && left.seconds == 0) {
        stop_recording();
      } 
      
      let minutes_text = left.minutes;
      let seconds_text = ('0'+left.seconds).slice(-2);
      document.getElementById("stoprecording").innerHTML = `Stoppa inspelning (${minutes_text}:${seconds_text})`;
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

  await add_picture_element("popcorn", "connection-status", "assets/popcorn.png", 36, 36, "legacy");

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