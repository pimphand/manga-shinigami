/**
 * Build small per-ABI release APKs locally (no EAS cloud needed).
 *
 * Usage: npm run build:apk
 *
 * Steps:
 *   1. expo prebuild (regenerates android/ from app.json)
 *   2. enable ABI splits so each APK ships only one architecture
 *   3. gradle :app:assembleRelease (R8 minify + resource shrink via expo-build-properties)
 *   4. copy APKs to build/ with versioned names
 *
 * Requirements: JDK 17, Android SDK with platform-tools/build-tools.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

const SPLITS_BLOCK = `    splits {
        abi {
            reset()
            enable true
            include "armeabi-v7a", "arm64-v8a"
            universalApk false
        }
    }
`;

function enableAbiSplits() {
  const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
  const content = fs.readFileSync(gradleFile, 'utf8');
  if (content.includes('universalApk false')) {
    console.log('ABI splits already enabled, skipping patch.');
    return;
  }
  const anchor = '    packagingOptions {';
  if (!content.includes(anchor)) {
    throw new Error('Could not find packagingOptions block in android/app/build.gradle');
  }
  fs.writeFileSync(gradleFile, content.replace(anchor, SPLITS_BLOCK + anchor));
  console.log('Enabled per-ABI APK splits (armeabi-v7a + arm64-v8a).');
}

function main() {
  // 1. Regenerate native project from app.json (wipes previous manual edits).
  run('npx expo prebuild --platform android --clean');

  // 2. Re-apply small-APK tweak that lives outside app.json.
  enableAbiSplits();

  // 3. Release build (device architectures only; skips x86 emulator ABIs).
  fs.chmodSync(path.join(root, 'android', 'gradlew'), 0o755);
  run(
    './gradlew :app:assembleRelease --parallel -PreactNativeArchitectures="armeabi-v7a,arm64-v8a"',
    path.join(root, 'android')
  );

  // 4. Collect versioned APKs into build/.
  const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const version = expo?.version ?? '1.0.0';
  const outDir = path.join(root, 'build');
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = [
    ['app-arm64-v8a-release.apk', `shinigami-manga-arm64-v${version}.apk`],
    ['app-armeabi-v7a-release.apk', `shinigami-manga-armeabi-v${version}.apk`],
  ];
  for (const [src, dest] of artifacts) {
    const srcPath = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', src);
    const destPath = path.join(outDir, dest);
    fs.copyFileSync(srcPath, destPath);
    const mb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
    console.log(`OK  build/${dest} (${mb} MB)`);
  }
}

main();
