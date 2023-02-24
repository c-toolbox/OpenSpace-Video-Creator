const { invoke } = window.__TAURI__.tauri;
const { readDir, BaseDirectory } = window.__TAURI__.fs;

let greetInputEl;
let greetMsgEl;

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document
    .querySelector("#greet-button")
    .addEventListener("click", () => greet());
});

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

//DEFAULTS
DEFAULT_VIDEO_PATH = "" 


//rust function test
async function start_ffmpeg() {
  return await invoke("start_ffmpeg");
}

//helper function to connect to opensapce
let connectToOpenSpace = () => {
  //setup the api params
  var host = document.getElementById('ipaddress').value;
  var api = window.openspaceApi(host, 4682);
  //notify users on disconnect
  api.onDisconnect(() => {
    console.log("disconnected");
    document.getElementById('container').className = "disconnected";
    document.getElementById('connection-status').style.opacity = 1;
    var disconnectedString = "Connect to OpenSpace: ";
    disconnectedString += '<input id="ipaddress" type=text placeholder="Enter ip address" /> ';
    disconnectedString += '<button onClick="connectToOpenSpace();">Connect</button>';
    document.getElementById('connection-status').innerHTML = disconnectedString;
    openspace = null;
  });
  //notify users and map buttons when connected
  api.onConnect(async () => {
    try {
      document.getElementById('container').className = "connected";
      document.getElementById('connection-status').innerHTML = "Connected to OpenSpace";
      openspace = await api.library();
      console.log('connected');

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
      document.getElementById("videofolder").innerText = "Current Screenshot folder: " + item.path;
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