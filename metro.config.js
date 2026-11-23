const http = require('node:http');

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function writeHeadWithIsolation(
  ...args
) {
  this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return writeHead.apply(this, args);
};

const config = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});

config.resolver.assetExts.push('onnx', 'wasm');
config.transformer.attendanceUpstreamTransformer = config.transformerPath;
config.transformerPath = require.resolve('./metro.transformer.js');

module.exports = config;
