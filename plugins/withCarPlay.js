/**
 * Config plugin de CarPlay.
 *
 * 1. Declara la escena de CarPlay en el Info.plist, junto a la del iPhone que ya
 *    trae la plantilla de Expo (ciclo de vida por escenas). La clase es
 *    `CarSceneDelegate`, del módulo local modules/carplay-bridge.
 * 2. Pide el permiso de CarPlay de la categoría "tareas de conducción".
 *
 * Importante: Apple tiene que aprobar ese permiso para tu cuenta de
 * desarrollador (formulario en developer.apple.com/carplay). Sin él, iOS no
 * muestra la app en la pantalla del carro aunque esté instalada.
 */
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const CARPLAY_ROLE = 'CPTemplateApplicationSceneSessionRoleApplication';
const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';

module.exports = function withCarPlay(config) {
  config = withInfoPlist(config, (c) => {
    const manifest = c.modResults.UIApplicationSceneManifest ?? {};
    // El iPhone y el carro muestran una escena cada uno a la vez.
    manifest.UIApplicationSupportsMultipleScenes = true;
    manifest.UISceneConfigurations = manifest.UISceneConfigurations ?? {};
    manifest.UISceneConfigurations[CARPLAY_ROLE] = [
      {
        UISceneClassName: 'CPTemplateApplicationScene',
        UISceneConfigurationName: 'CarPlay',
        UISceneDelegateClassName: 'CarSceneDelegate',
      },
    ];
    c.modResults.UIApplicationSceneManifest = manifest;
    return c;
  });

  config = withEntitlementsPlist(config, (c) => {
    c.modResults[ENTITLEMENT] = true;
    return c;
  });

  return config;
};
