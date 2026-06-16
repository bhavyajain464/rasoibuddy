import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}. Run expo prebuild first.`);
  process.exit(1);
}

const xml = fs.readFileSync(manifestPath, 'utf8').trimStart();

if (!xml.startsWith('<manifest')) {
  console.error(
    'AndroidManifest.xml must start with <manifest>. ' +
      'A config plugin may have added an invalid wrapper element (for example <root>).',
  );
  process.exit(1);
}

if (/<root[\s>]/i.test(xml)) {
  console.error(
    'AndroidManifest.xml contains an invalid <root> wrapper. ' +
      'Use AndroidConfig.Manifest.ensureToolsAvailable() in config plugins.',
  );
  process.exit(1);
}

console.log('AndroidManifest.xml structure looks valid.');
