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

// Google Identity Services popup/postMessage needs COOP that allows popups (local web dev).
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    return middleware(req, res, next);
  },
};

module.exports = config;
