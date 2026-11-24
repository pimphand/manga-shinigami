import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

// Ganti jika repo pindah. Updater membaca GitHub Releases publik repo ini.
export const GITHUB_OWNER = 'pimphand';
export const GITHUB_REPO = 'manga-shinigami';

export function getCurrentVersion() {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '1.0.0'
  );
}

// Bandingkan versi semver sederhana: 1 jika a > b, -1 jika a < b, 0 jika sama.
export function compareVersions(a, b) {
  const pa = String(a || '')
    .replace(/^[vV]/, '')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '')
    .replace(/^[vV]/, '')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function pickApkAsset(assets) {
  const apks = (assets || []).filter(
    (a) => typeof a?.name === 'string' && a.name.endsWith('.apk')
  );
  if (apks.length === 0) return null;
  // Kebanyakan HP modern arm64; build-apk.js menghasilkan varian arm64 + armeabi.
  return (
    apks.find((a) => a.name.includes('arm64')) ??
    apks.find((a) => a.name.includes('universal')) ??
    apks[0]
  );
}

// Cek rilis terbaru di GitHub. Kembalikan info update (tidak mengunduh apa pun).
export async function checkForUpdate() {
  if (Platform.OS !== 'android') {
    return {
      supported: false,
      hasUpdate: false,
      current: getCurrentVersion(),
      latest: null,
    };
  }
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) {
    throw new Error('Belum ada rilis di GitHub');
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error('Gagal cek pembaruan (rate limit GitHub, coba lagi nanti)');
  }
  if (!res.ok) {
    throw new Error(`Gagal cek pembaruan (${res.status})`);
  }
  const data = await res.json();
  const latest = String(data?.tag_name || '').replace(/^[vV]/, '');
  if (!latest) throw new Error('Format rilis GitHub tidak valid');
  const asset = pickApkAsset(data?.assets);
  const current = getCurrentVersion();
  return {
    supported: true,
    hasUpdate: compareVersions(latest, current) > 0,
    current,
    latest,
    notes: data?.body || '',
    apkUrl: asset?.browser_download_url || null,
    assetName: asset?.name || null,
    assetSize: asset?.size || 0,
    htmlUrl: data?.html_url || null,
  };
}

// Unduhan yang sedang berjalan — dipertahankan supaya bisa dijeda saat
// aplikasi ke background lalu dilanjutkan dari byte terakhir (bukan dari nol).
let activeResumable = null;
let pauseRequested = false;

export function isDownloadActive() {
  return activeResumable != null;
}

// Dipanggil saat aplikasi ke background: hentikan aktivitas jaringan agar
// hemat baterai & kuota. Mengembalikan true jika ada unduhan yang dijeda.
export async function pauseActiveDownload() {
  if (!activeResumable) return false;
  pauseRequested = true;
  try {
    await activeResumable.pauseAsync();
  } catch (e) {
    // Unduhan keburu selesai/gagal tepat saat dijeda — abaikan.
  }
  return true;
}

// Dipanggil saat kembali foreground (atau tombol Lanjutkan): sambung unduhan
// dari posisi terakhir, lalu buka installer sistem seperti biasa.
export async function resumeActiveDownload() {
  const resumable = activeResumable;
  if (!resumable) throw new Error('Tidak ada unduhan yang dijeda');
  pauseRequested = false;
  const result = await resumable.resumeAsync();
  activeResumable = null;
  if (!result?.uri) throw new Error('Unduhan gagal');
  await installApkUri(result.uri);
  return result.uri;
}

async function installApkUri(uri) {
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

// Unduh APK rilis lalu buka installer sistem. progressCb menerima 0..1.
export async function downloadAndInstallApk(apkUrl, assetName, progressCb) {
  if (Platform.OS !== 'android') {
    throw new Error('Instal APK hanya didukung di Android');
  }
  if (!apkUrl) throw new Error('URL APK tidak tersedia di rilis ini');
  const fileName = assetName || 'update.apk';
  const target = `${FileSystem.cacheDirectory}${fileName}`;
  const resumable = FileSystem.createDownloadResumable(
    apkUrl,
    target,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        progressCb?.(
          p.totalBytesWritten / p.totalBytesExpectedToWrite
        );
      }
    }
  );
  activeResumable = resumable;
  try {
    const result = await resumable.downloadAsync();
    activeResumable = null;
    pauseRequested = false;
    if (!result?.uri) throw new Error('Unduhan gagal');
    await installApkUri(result.uri);
    return result.uri;
  } catch (e) {
    if (pauseRequested) {
      // Bukan kegagalan: unduhan dijeda, resumable dipertahankan untuk resume.
      pauseRequested = false;
      const paused = new Error('Unduhan dijeda');
      paused.code = 'DOWNLOAD_PAUSED';
      throw paused;
    }
    activeResumable = null;
    pauseRequested = false;
    throw e;
  }
}
