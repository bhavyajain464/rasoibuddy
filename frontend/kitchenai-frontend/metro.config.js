const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Load prod.env (or DOTENV_CONFIG_PATH) when set — same as npm scripts / build-android-release.sh.
// No fallback path here; release builds must export DOTENV_CONFIG_PATH explicitly.
if (process.env.DOTENV_CONFIG_PATH) {
  require('dotenv').config({
    path: path.resolve(__dirname, process.env.DOTENV_CONFIG_PATH),
  });
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
