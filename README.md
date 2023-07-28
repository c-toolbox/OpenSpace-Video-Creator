# OpenSpace Video Creator

This tool is built in Tauri (https://tauri.app/) using HTML/CSS/JS and RUST.
The tool was **only built for Windows** (primary Windows 10/11) but may work on Windows 7 if specifically configured for it 
(see https://tauri.app/v1/guides/building/windows#supporting-windows-7)


## Getting started

1. Clone this repo
2. Install NPM: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
- Tested with Node 13.14.0 and up to 18.15.0 (NPM version was the one shipped with respective Node version)
3. Follow Tauri prereq. guide: https://tauri.app/v1/guides/getting-started/prerequisites
4. Go to the folder for this repo and run following command in CMD/PS/Terminal: `npm run tauri dev`

Note: you may need to install some dependencies via npm, it will say which ones 😉

## Developer information

### How to build binaries for distribution

If you want to build and distribute the program, just run the file `.\OSVC_Installer\build_and_package_installer.ps1`.
This file will build the Tauri app, copy the and rename the binary file and then zip it.
It's easy to modify this script if you ever want to add something else into the .zip file before distribution.

If you don't want to do that, you can build manually:
To build a binary for distribution, execute command: `npm run tauri build`
You can read more here for the nuances and options: https://tauri.app/v1/guides/building/windows

Once the build finishes you can find the .msi under: `...\src-tauri\target\release\bundle\msi`
<div>
Just send the zip/package to the person who wants it and they can install it to get OpenSpace Video Creator <p style="display: inline; font-size: x-large">🎉🎊🎈</p>
</div>

### How to update app version
If want to change the app version for a new release or patch, you need to update the app version in the following files:
- Cargo.toml
- tauri.conf.json


### How to create a proper outro
1. Design a template and render it to a PNG sequence in your program of choice.
For this project Adobe After Effects was used and you can find the project file for it in the `misc` folder.
2. Once you have the PNG sequence, use ffmpeg to generate the outro video in `mp4 (h264)` format.
For this project, the following line was used: `ffmpeg -framerate 30 -i '<path>/<sequence-name>_%05d.png' -c:v libx264 -pix_fmt yuv420p -s 1920x1080 -crf 17 $HOME/Videos/<outro-name>.mp4` 
**Note:** `-framerate`, `-c:v libx264`, `-pix_fmt yuv420p`, `-s 1920x1080` and `<outro-name>.mp4` needs to be tailored and matched to the __generated video__ that OpenSpace Video Creator makes in `...\src-tauri\src\main.rs` function `start_ffmpeg`. 
These needs to match in order for the video concatenation between __generated video__ and __generated outro__ to work properly.
You can read more about ffmpeg and PNG sequences here: https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide/image_sequence
3. Once the outro is generated, place it into: `...\src-tauri\assets` 
4. Go to file `...\src-tauri\tauri.conf.json` and add reference the resource under `bundle -> resources`
The outro should now be accessible from the code (which you'll have to figure out yourself 😉)

## Other things and good-to-knows
Below you will find some additional information that may be good to know.

### Space is not as big as you think (HDD / SDD storage)
Generating the PNG sequence takes a lot of space (issue [#4](https://github.com/c-toolbox/OpenSpace-Video-Creator/issues/4) would solve this).</br>
Using screenshots in 720p (30fps) you will generate about 4,5 GB worht of PNGs.</br>
Using screenshots in 1440p (30fps) you will generate about 10,5 GB worth of PNGs.</br>
Default OpenSpace rendering (and screenshot) resolution for 1080p screen is 720p and 1440p for a 4K monitor.

<div>
And don't worry, the program cleans up after itself <p style="display: inline; font-size: x-large">🧹🗑️</p>
</div>

### Don't tell anyone, but...
... there is a way to disable automatic outro, change FPS (30 or 60 for now), remove the time limit for recordings and to show all existing recordings (not limited to last 24 hours).
In order to show these options, input the _Konami code_ 🎮🕹️

This options are now shown by default as we always want the outro and other settings as default for the workshops. 
However, there may be times when someone wants to use this tool under other circumstances.


## A cautionary tale...
The source code is messy.

```
Start of project
"This will only be used in some school workshops and is not meant for permanent use...
I don't need any web application framework, this bad boy will only need few buttons."

* A few buttons and other things later *
"Halp."

```
