// Configuración de Metro SOLO para la vista previa en navegador (ver README).
// Se copia a la raíz del proyecto para exportar la versión web y se borra después:
// la app de iOS se compila sin este archivo.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const shims = {
  'react-native-maps': path.join(__dirname, 'tools/preview/maps-shim.js'),
  'expo-sqlite': path.join(__dirname, 'tools/preview/sqlite-shim.js'),
};
const original = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && shims[moduleName]) return { type: 'sourceFile', filePath: shims[moduleName] };
  return (original ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;
