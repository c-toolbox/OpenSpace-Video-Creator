# OpenSpace Video Creator

This tool is built in Tauri (https://tauri.app/) using HTML/CSS/JS and RUST.
The tool was **only built for Windows** (primary Windows 10/11) but may work on Windows 7 if specifically configured for it 
(see https://tauri.app/v1/guides/building/windows#supporting-windows-7)

------------------

<h2 style="color:red">Info and known bugs</h2>

**Application requires ffmpeg (verified versions: 5.1.2 and 6.0.0) and OpenSpace version >=0.17.0**
ffmpeg is installed during installation if you're using the installation script.

Subscription to Topic in OpenSpace 0.18.2 only works ~10% of the time for uknown reasons.
Works perfectly fine in OpenSpace 0.17.0 and 0.19.0.

#### Some things that could be added
- Toggle to show _all_ recordings (easter egg)

---------------

## Getting started

1. Clone this repo
2. Install NPM: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
- Tested with Node 13.14.0 and up to 18.15.0 (NPM version was the one shipped with respective Node version)
3. Follow Tauri prereq. guide: https://tauri.app/v1/guides/getting-started/prerequisites
4. Go to the folder for this repo and run following command in CMD/PS/Terminal: `npm run tauri dev`

Note: you may need to install some dependencies via npm, it will say which ones 😉

## How to build binaries for distribution

To build a binary for distribution, execute command: `npm run tauri build`
You can read more here for the nuances and options: https://tauri.app/v1/guides/building/windows

Once the build finishes you can find the .msi under: `...\src-tauri\target\release\bundle\msi`
For there you can either use the installation file as-is or use it together with the installation script - see below.

## Package the program and the installation script

There is an installation script in the `OSVC_installer` folder which installs both ffmpeg and OpenSpace Video Creator.
If you want to send the program and the installation script to someone, do as follows.

1. Run the Powershell script called `package_installer.ps1`. 
This will build Tauri, copy and rename the .msi file and generate a .zip file with the correct contents.
**Note:** If you get errors during building step, try to remove the existing .msi package or run the script as admin.
2. Send the .zip file to your friend or foe :)
<div>
The person who receives the .zip file only has to unzip the file and then run the file `RUN_AS_ADMIN.bat` as admin to install both ffmpeg and OpenSpace Video Creator <p style="display: inline; font-size: x-large">🎉🎊🎈</p>
</div>

### Other things and good-to-knows
Below you will find some additional information that may be good to know.

##### Don't tell anyone, but...
... there is a way to disable automatic outro, change FPS (30 or 60 for now) and to remove the time limit for recordings.
In the application, input the _Konami code_ 🎮🕹️

This is option is not shown by default as we always want the outro and other settings as default for the workshops. 
However, there may be times when someone wants to use this tool under other circumstances.

##### How to create a proper outro
1. Design a template and render it to a PNG sequence in your program of choice.
For this project Adobe After Effects was used and you can find the project file for it in the `misc` folder.
2. Once you have the PNG sequence, use ffmpeg to generate the outro video in `mp4 (h264)` format.
For this project, the following line was used: `ffmpeg -framerate 30 -i '<path>/<sequence-name>_%05d.png' -c:v libx264 -pix_fmt yuv420p -s 1920x1080 -crf 17 $HOME/Videos/<outro-name>.mp4` 
**Note:** `-framerate`, `<path>/<sequence-name>_%05d.png`, `-s 1920x1080` and `<outro-name>.mp4` needs to be tailored and matched to the __generated video__ that OpenSpace Video Creator makes in `...\src-tauri\src\main.rs` function `start_ffmpeg`. 
These needs to match in order for the video concatenation to work properly (between generated video and generated outro).
You can read more about ffmpeg and PNG sequences here: https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide/image_sequence
3. Once the outro is generated, place it into: `...\src-tauri\assets` 
4. Go to file `...\src-tauri\tauri.conf.json` and add reference the resource under `bundle -> resources`
The outro should now be accessible from the code (which you'll have to figure out yourself 😉)


##### Space is not as big as you think (hard drives)
Generating the PNG sequence takes a lot of space.
Using screenshots in 720p (30fps) you will generate about 4,5 GB worht of PNGs.
Using screenshots in 1440p (30fps) you will generate about 10,5 GB worth of PNGs.
Default OpenSpace rendering (and screenshot) resolution for 1080p screen is 720p and 1440p for a 4K monitor.

<div>
And don't worry, the program cleans up after itself <p style="display: inline; font-size: x-large">🧹🗑️</p>
</div>


### A cautionary tale...
The source code is messy.

```
Start of project
"This will only be used in some school workshops and is not meant for permanent use...
I don't need any web application framework, this bad boy will only need few buttons."

* A few buttons and other things later *
"Halp."

```