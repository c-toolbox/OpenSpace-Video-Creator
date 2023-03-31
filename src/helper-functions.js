/*
* Helper function to sleep the thread for some time
*/
const sleep = ms => new Promise(r => setTimeout(r, ms));



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
* Calculates minutes and seconds until a duration has passed
*   starttime: Date object which is the time that the countdown was started
*   duration_as_milliseconds: the length of the duration in milliseconds
* Return (Object): Object containing how many minutes and seconds
                  Format: ...m:ss
*/
function time_left(starttime = null, duration_as_milliseconds = null) {

  // Assert
  if(!starttime || !duration_as_milliseconds) {
    console.error("ERROR: time_left was not called with proper arguments");
    return {minutes: 0, seconds: 0};
  }

  let now = new Date();
  let diff = Math.max((duration_as_milliseconds-(now-starttime))/1000, 0);
  let min = Math.floor(diff/60);
  let sec = Math.floor(diff%60);
  return {minutes: min, seconds: sec};
}



/*
* Parses and filters the log file from ffmpeg in order to see how much progress has been made
*   framecount: The number of frames in the PNG sequence
* Return (NUMBER): Percent value
*/
async function get_ffmpeg_progress(framecount) {
  let s = await invoke("check_progress");
  s = s.split(/[\n]/).filter( line => line.includes("frame="));
  s = s.map( x => (x.replace(/\s/g,'')).split("fps=")[0].replace(/[^0-9]/gi,'') );
  if(s.length >= 1) {
    return parseInt(((s[s.length - 1] / framecount) * 100).toPrecision(3))
  }
}




/*
* Makes sure that we're running on a supported version of openspace.
* Compares current OpenSpace version to a minimum version
*   minimum: The minimum version number allowed
*/
async function assert_openspace_version(minimum) {
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
    let result = majorminorpatch.localeCompare(minimum, undefined, { numeric: true, sensitivity: 'base' });
    if(result < 0) {
      enable_overlay("#d70000", "Uppdatera Openspace \n Du måste ha OpenSpace 0.17.0 eller nyare",  0.0, "yellow", "x-large");
      return;
    }
  }
}



/*
* Sets up a topic subscription for specific events
*   topic: topic type as defined by OpenSpace
*   event: event type as defined by OpenSpace
*   properties: array of strings (properties) as defined by OpenSpace
*   onMessage: callback function that will be used for the received data
*         NOTE: callback function MUST have one input argument for data
*/
function create_topic_subscription(topic = null, event = null, properties = null, onMessage = null) {

  // Assert 
  if(!topic || !event || !properties || !onMessage) {
    console.error("ERROR: create_topic_subscription was not called with proper arguments");
  }

  return () => {
    let t = API.startTopic(topic, {
      event: event,
      properties: properties,
    });
    (async () => {
      for await (const data of t.iterator()) {
        await onMessage(data);
      }
    })();
  };
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
* Gets the screenshot number that is the first in the sequence
* Workaround for older OpenSpace versions
*/
async function get_screenshot_starting_index() {
  
  let latest = Number.MAX_SAFE_INTEGER;
  let files = await invoke("get_screenshot_names", {screenshotfolderpath: _SCREENSHOTS_PATH_});
  let reg = /((^OpenSpace_))(([0-9]{6}))(.png$)/g

  files.forEach( f => {
    if(f.match(reg)) {
      let n = Number(f.replace(/\D/g, ''));
      if (n < latest) {
        latest = n;
      }
    }
  });

  return latest == Number.MAX_SAFE_INTEGER ? -1 : latest ;
}


/*
* Adds new recording/video information in the information-box 
*   TYPE: What type if message, if no type is given, a generic text message will be added
*   msg: the text message that will be added
*/
async function add_to_info_box(TYPE = null, msg = "") {
 
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
* Creates picture element with an img element and adds it to parent
*   pictureid: unique ID for the picture element
*   parentid: parent html id
*   resource: path to tauri resource
*   picturewidth: width of the picture in px
*   pictureheight: height of the picture in px
*   imageclass: any class you want to add to the img element
*   pictureclass: any class you want to add to the img element
*/
async function add_picture_element(pictureid, parentid = null, resource = null, picturewidth = null, pictureheight = null, imageclass = "", pictureclass = "") {

  if(!parentid || !resource || !picturewidth || !pictureheight) {
    console.error("ERROR: add_picture_element was called without proper arguments");
    return;
  }

  let elem = document.createElement("picture");
  elem.id = pictureid;
  document.getElementById(parentid).append(elem);

  const path = await resolveResource(resource);
  const assetpath = convertFileSrc(path);
  const source = document.createElement('source');
  source.srcset = assetpath;
  source.width = picturewidth;
  source.height = pictureheight
  const image = document.createElement("img");
  image.classList.add(imageclass);
  elem.appendChild(source);
  elem.appendChild(image);
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



/*
* Enables the overlay and sets a message
*/
async function enable_overlay(backgroundcolor = "black", text = "", fadespeed = 1.0, textcolor = "white", fontsize = "xx-large") {

  // Set initial things
  document.getElementById("overlaytext").style.transition = `all 0s`;
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
