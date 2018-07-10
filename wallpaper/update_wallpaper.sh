#!/bin/bash

set -e

/Users/rupertdeese/.nvm/versions/node/v8.7.0/bin/node ../src/index.js --wallpaper
/usr/bin/sqlite3 ~/Library/Application\ Support/Dock/desktoppicture.db "DELETE FROM data; INSERT INTO data (value) VALUES ('~/Documents/misc/McCormack-niche/wallpaper/wallpaper.png'), ('5'), ('0.9904685020446777'), ('0.9594812989234924'), ('0.864527702331543');" && killall Dock;
