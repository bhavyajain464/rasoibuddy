/**
 * Play Console flags deprecated Window.setStatusBarColor / setNavigationBarColor
 * inside transitive release dependencies. This plugin:
 * 1. Excludes Compose ui-tooling (PreviewActivity) from release classpaths
 * 2. Strips PreviewActivity from the merged manifest
 */
const {
  withAndroidManifest,
  withAndroidStyles,
  withAppBuildGradle,
  withProjectBuildGradle,
  AndroidConfig,
} = require('expo/config-plugins');

const MARKER = '// @rasoibuddy edge-to-edge release fixes';
const PREVIEW_ACTIVITY = 'androidx.compose.ui.tooling.PreviewActivity';

const DEPRECATED_THEME_ITEMS = [
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:windowTranslucentStatus',
  'android:windowTranslucentNavigation',
];

function withEdgeToEdgeReleaseFix(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }
    const snippet = `
${MARKER}
gradle.projectsLoaded {
  rootProject.subprojects { subproject ->
    subproject.afterEvaluate {
      subproject.configurations.configureEach { configuration ->
        if (configuration.name.toLowerCase().contains('release')) {
          configuration.exclude group: 'androidx.compose.ui', module: 'ui-tooling'
        }
      }
    }
  }
}
`;
    cfg.modResults.contents += snippet;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }
    const snippet = `
    ${MARKER}
    configurations.configureEach {
      if (it.name.toLowerCase().contains('release')) {
        exclude group: 'androidx.compose.ui', module: 'ui-tooling'
      }
    }
`;
    cfg.modResults.contents = cfg.modResults.contents.replace(/^android\s*\{/m, `android {${snippet}`);
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(cfg.modResults);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const activities = app.activity ?? [];
    const already = activities.some(
      (entry) => entry?.$?.['android:name'] === PREVIEW_ACTIVITY,
    );
    if (!already) {
      app.activity = [
        ...activities,
        {
          $: {
            'android:name': PREVIEW_ACTIVITY,
            'tools:node': 'remove',
          },
        },
      ];
    }
    cfg.modResults = manifest;
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    let styles = cfg.modResults;
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    for (const name of DEPRECATED_THEME_ITEMS) {
      styles = AndroidConfig.Styles.removeStylesItem({ xml: styles, parent, name });
    }
    if (styles.resources?.style) {
      for (const styleGroup of styles.resources.style) {
        if (!Array.isArray(styleGroup.item)) continue;
        styleGroup.item = styleGroup.item.filter(
          (item) => !DEPRECATED_THEME_ITEMS.includes(item.$?.name),
        );
      }
    }
    cfg.modResults = styles;
    return cfg;
  });

  return config;
}

module.exports = withEdgeToEdgeReleaseFix;
