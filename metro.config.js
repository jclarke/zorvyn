const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// markdown-it (via react-native-markdown-display) requires Node's `punycode`,
// which is not in the RN runtime. Map it to the npm polyfill.
const punycodePath = path.resolve(__dirname, 'node_modules/punycode/punycode.js');

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'punycode' || moduleName === 'node:punycode') {
    return { filePath: punycodePath, type: 'sourceFile' };
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  punycode: path.resolve(__dirname, 'node_modules/punycode'),
};

module.exports = config;
