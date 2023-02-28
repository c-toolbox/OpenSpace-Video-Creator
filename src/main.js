const { invoke } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;

let greetInputEl;
let greetMsgEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

//DEFAULTS
DEFAULT_VIDEO_PATH = "" 


//rust function test
async function start_ffmpeg() {
  let pre_status = await invoke("pre_ffmpeg").then( (res) => {return res});
  console.log("pre status: " + pre_status);
  if(pre_status.includes(0)) {
    check_progress();
    //render status
    let m = await invoke("start_ffmpeg").then( (msg) => {return msg});
    console.log(m);
  }
  else {
    //delete the progress.space file
    console.log("Error: Something went wrong in pre_ffmpeg");
    return;
  }



  // check if success and return false/true depending on result
}

async function check_progress() {

  document.getElementById('container').className = "rendering";
  document.getElementById('connection-status').innerHTML = "Rendering...";

  let fname = async function() {
    let b = await invoke("check_progress").then( (msg) => {return msg});
    console.log(b);
    if(!b) {
      clearInterval(_INTERLVA_ID_);
      setReadyState();
    }    
  }

  _INTERLVA_ID_ = setInterval(fname, 500);

}

async function test() {

  let res = await invoke("check_progress").then( (msg) => {return msg});
  console.log("is in progress: " + res);

}

//helper function to connect to opensapce
let connectToOpenSpace = () => {
  //setup the api params
  var host = document.getElementById('ipaddress').value;
  var api = window.openspaceApi(host, 4682);
  //notify users on disconnect
  api.onDisconnect(() => {
    setDisconnectedState();
    openspace = null;
  });
  //notify users and map buttons when connected
  api.onConnect(async () => {
    try {
      setReadyState();
      openspace = await api.library();
      
      setScreenshotPathText();
      setVideoExportPathText();

    } catch (e) {
      console.log('OpenSpace library could not be loaded: Error: \n', e);
      return;
    }
  })
  //connect
  api.connect();
};

async function setScreenshotPathText() {
  let path = await getFolderPath("${SCREENSHOTS}");
  document.getElementById("screenshotfolder").innerText = "Current Screenshot folder: " + path[1];
}

async function setVideoExportPathText() {
  // https://crates.io/crates/directories ?

  // const search = '\\';
  // const replaceWith = '/';
  // how to THE_STRING.split(search).join(replaceWith);

  var r = await readDir("",{ dir: BaseDirectory.Home});
  r.forEach((item) => {
    if(item.name === "Videos") {
      document.getElementById("videofolder").innerText = "Current video export folder: " + item.path;
    }
  })
}

async function setScreenshotFolder() {
  // prob. not needed
}

async function getFolderPath(relative){
  return await openspace.absPath(relative);
}

async function dirTest() {

}

function setReadyState() {
  console.log('connected');
  document.getElementById('container').className = "connected";
  document.getElementById('connection-status').innerHTML = "Ready";
}

function setRenderingState() {

}

function setDisconnectedState() {
  console.log("disconnected");
  document.getElementById('container').className = "disconnected";
  document.getElementById('connection-status').style.opacity = 1;
  var disconnectedString = "Connect to OpenSpace: ";
  disconnectedString += '<input id="ipaddress" type=text placeholder="Enter ip address" /> ';
  disconnectedString += '<button onClick="connectToOpenSpace();">Connect</button>';
  document.getElementById('connection-status').innerHTML = disconnectedString;
}