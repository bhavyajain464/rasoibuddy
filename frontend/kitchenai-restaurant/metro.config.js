const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

if (process.env.DOTENV_CONFIG_PATH) {
  require('dotenv').config({
    path: path.resolve(__dirname, process.env.DOTENV_CONFIG_PATH),
  });
}

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const workspaceModules = path.resolve(workspaceRoot, 'node_modules');
const appModules = path.resolve(projectRoot, 'node_modules');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch shared workspace packages only — not sibling apps (avoids duplicate React).
config.watchFolders = [path.resolve(workspaceRoot, 'packages/api-core')];

config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [appModules, workspaceModules];
// Prefer .web.tsx / .native.tsx over generic .tsx (avoids loading native-only deps on web).
config.resolver.unstable_enablePackageExports = false;

// Single React instance for hooks (react + react-dom + renderer must match).
config.resolver.extraNodeModules = {
  react: path.resolve(appModules, 'react'),
  'react-dom': path.resolve(appModules, 'react-dom'),
  '@kitchenai/api-core': path.resolve(workspaceRoot, 'packages/api-core'),
};

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    return middleware(req, res, next);
  },
};

module.exports = config;
