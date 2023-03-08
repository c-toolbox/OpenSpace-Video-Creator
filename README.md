# OpenSpace Video Creator

This tool is built in Tauri (https://tauri.app/) using HTML/CSS/JS and RUST.
The tool was only built for Windows (primary Windows 11/10) but may work on Windows 7 if specifically built for it (see https://tauri.app/v1/guides/building/windows#supporting-windows-7)

## Getting started

1. Clone this repo
2. Install NPM: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
3. Follow Tauri prereq. guide: https://tauri.app/v1/guides/getting-started/prerequisites
4. Go to the folder for this repo and run following command in CMD/PS/Terminal: `npm run tauri dev`

Note: you may need to install some dependencies via npm, it will say which ones 😉

## How to build binaries for distribution

To build a binary for distribution, execute command: `npm run tauri build`
You can read more here for the nuances and options: https://tauri.app/v1/guides/building/windows
