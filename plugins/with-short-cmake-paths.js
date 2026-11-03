// Windows limits paths to 260 characters, and some native dependencies (e.g.
// react-native-gesture-handler's codegen) produce longer object-file paths, which
// makes local Android builds fail with "Filename longer than 260 characters".
// CMAKE_OBJECT_PATH_MAX tells CMake to shorten those names with a hash.
// Harmless on macOS/Linux and on EAS Build.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// with-short-cmake-paths';

module.exports = function withShortCmakePaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=250"
            }
        }
    }
}
`;
    }
    return cfg;
  });
};
