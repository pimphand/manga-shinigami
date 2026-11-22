import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '../context/LibraryContext';
import colors from '../theme';
import {
  checkForUpdate,
  downloadAndInstallApk,
  pauseActiveDownload,
  resumeActiveDownload,
  getCurrentVersion,
  GITHUB_OWNER,
  GITHUB_REPO,
} from '../lib/appUpdate';
import { exportLibraryToSqlite } from '../lib/exportLibraryToSqlite';
import { importLibraryAuto } from '../lib/importKomikindoDb';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { favorites, history, replaceLibrary } = useLibrary();

  const [updateState, setUpdateState] = useState('idle'); // idle | checking | available | downloading | paused | uptodate | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busyLibrary, setBusyLibrary] = useState(null); // null | 'export' | 'import'
  const [libraryMessage, setLibraryMessage] = useState(null);

  const onCheckUpdate = async () => {
    setUpdateState('checking');
    setUpdateError(null);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
      if (!info.supported) {
        setUpdateState('error');
        setUpdateError('Pembaruan otomatis hanya didukung di Android');
      } else if (info.hasUpdate && info.apkUrl) {
        setUpdateState('available');
      } else if (info.hasUpdate && !info.apkUrl) {
        setUpdateState('error');
        setUpdateError('Rilis terbaru tidak berisi file APK');
      } else {
        setUpdateState('uptodate');
      }
    } catch (e) {
      setUpdateState('error');
      setUpdateError(e?.message || 'Gagal memeriksa pembaruan');
    }
  };

  // Satu-satunya jalur resume supaya AppState foreground dan tombol manual
  // tidak bisa melanjutkan unduhan yang sama dua kali.
  const resumeGuard = useRef(false);
  const doResumeDownload = useCallback(async () => {
    if (resumeGuard.current) return;
    resumeGuard.current = true;
    setUpdateState('downloading');
    setUpdateError(null);
    try {
      await resumeActiveDownload();
      setUpdateState('available');
      setProgress(0);
    } catch (e) {
      setUpdateState('error');
      setUpdateError(e?.message || 'Gagal melanjutkan unduhan');
    } finally {
      resumeGuard.current = false;
    }
  }, []);

  // Unduhan dijeda saat ke background (hemat baterai/kuota), dilanjut
  // otomatis saat kembali foreground — tanpa mengulang dari nol.
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const st = updateStateRef.current;
      if (s === 'background' || s === 'inactive') {
        if (st === 'downloading') {
          pauseActiveDownload().then((ok) => {
            if (ok) setUpdateState('paused');
          });
        }
      } else if (s === 'active' && st === 'paused') {
        doResumeDownload();
      }
    });
    return () => sub.remove();
  }, [doResumeDownload]);

  const onDownloadUpdate = async () => {
    if (!updateInfo?.apkUrl) return;
    setUpdateState('downloading');
    setProgress(0);
    setUpdateError(null);
    try {
      await downloadAndInstallApk(updateInfo.apkUrl, updateInfo.assetName, setProgress);
      setUpdateState('available');
      setProgress(0);
    } catch (e) {
      if (e?.code === 'DOWNLOAD_PAUSED') {
        setUpdateState('paused');
        return;
      }
      setUpdateState('error');
      setUpdateError(e?.message || 'Gagal mengunduh pembaruan');
    }
  };

  const onExportLibrary = async () => {
    if (busyLibrary) return;
    setBusyLibrary('export');
    setLibraryMessage(null);
    try {
      const result = await exportLibraryToSqlite({ favorites, history });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setLibraryMessage(`Tersimpan: ${result.fileName} (${result.favorites} favorit, ${result.history} riwayat)`);
        return;
      }
      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Bagikan database pustaka',
      });
      setLibraryMessage(
        `Diekspor: ${result.favorites} favorit & ${result.history} riwayat`
      );
    } catch (e) {
      setLibraryMessage(e?.message || 'Gagal mengekspor pustaka');
    } finally {
      setBusyLibrary(null);
    }
  };

  const onImportLibrary = async () => {
    if (busyLibrary) return;
    setBusyLibrary('import');
    setLibraryMessage(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/octet-stream', 'application/x-sqlite3', '*/*'],
        copyToCacheDirectory: true,
      });
      const canceled = picked?.canceled ?? picked?.type === 'cancel';
      const uri = picked?.assets?.[0]?.uri ?? picked?.uri;
      if (canceled || !uri) return;
      const data = await importLibraryAuto(uri, ({ done, total, title }) => {
        setLibraryMessage(`Mencocokkan ${done}/${total}: ${title}`);
      });
      await replaceLibrary(data);
      const extra =
        data.source === 'komikindo' && data.unmatched.length > 0
          ? ` ${data.unmatched.length} judul tidak dikenali: ` +
            `${data.unmatched.slice(0, 3).map((u) => u.title).join('; ')}`
          : '';
      const msg =
        `Dipulihkan: ${data.favorites.length} favorit & ` +
        `${data.history.length} riwayat. Pustaka saat ini diganti seluruhnya.${extra}`;
      setLibraryMessage(msg);
      Alert.alert('Impor berhasil', msg);
    } catch (e) {
      const msg = e?.message || 'Gagal mengimpor pustaka';
      setLibraryMessage(msg);
      Alert.alert('Impor gagal', msg);
    } finally {
      setBusyLibrary(null);
    }
  };

  const buildNumber = Application.nativeBuildVersion ?? '-';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
    >
      <Text style={styles.header}>Pengaturan</Text>

      <Text style={styles.sectionTitle}>Pembaruan Aplikasi</Text>
      <View style={styles.card}>
        <Text style={styles.versionText}>Versi terpasang: {getCurrentVersion()}</Text>
        {updateInfo?.latest ? (
          <Text style={styles.versionText}>Versi terbaru: {updateInfo.latest}</Text>
        ) : null}
        {updateState === 'available' && updateInfo?.notes ? (
          <Text style={styles.notesText} numberOfLines={4}>
            {updateInfo.notes}
          </Text>
        ) : null}
        {updateState === 'uptodate' ? (
          <Text style={styles.okText}>Sudah versi terbaru</Text>
        ) : null}
        {updateState === 'error' ? (
          <Text style={styles.errText}>{updateError}</Text>
        ) : null}
        {updateState === 'downloading' || updateState === 'paused' ? (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
        {updateState === 'checking' || updateState === 'downloading' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>
              {updateState === 'checking'
                ? 'Memeriksa pembaruan...'
                : `Mengunduh... ${Math.round(progress * 100)}%`}
            </Text>
          </View>
        ) : updateState === 'paused' ? (
          <View>
            <Text style={styles.descText}>
              Unduhan dijeda {Math.round(progress * 100)}% (aplikasi sempat ke
              background). Dilanjutkan otomatis saat aplikasi dibuka.
            </Text>
            <Pressable style={styles.primaryButton} onPress={doResumeDownload}>
              <Text style={styles.primaryButtonText}>Lanjutkan Sekarang</Text>
            </Pressable>
          </View>
        ) : updateState === 'available' ? (
          <Pressable style={styles.primaryButton} onPress={onDownloadUpdate}>
            <Text style={styles.primaryButtonText}>
              Unduh & Instal v{updateInfo.latest}
              {updateInfo.assetSize ? ` (${(updateInfo.assetSize / 1024 / 1024).toFixed(1)} MB)` : ''}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={onCheckUpdate}>
            <Text style={styles.primaryButtonText}>Cek Pembaruan</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>Pustaka</Text>
      <View style={styles.card}>
        <Text style={styles.descText}>
          Cadangkan favorit & riwayat baca ke file .db, atau pulihkan dari file
          cadangan. Impor akan mengganti seluruh pustaka saat ini.
        </Text>
        <Pressable
          style={[styles.rowButton, busyLibrary && styles.disabled]}
          onPress={onExportLibrary}
          disabled={!!busyLibrary}
        >
          {busyLibrary === 'export' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="share-outline" size={18} color={colors.accent} />
          )}
          <Text style={styles.rowButtonText}>Export Pustaka (.db)</Text>
        </Pressable>
        <Pressable
          style={[styles.rowButton, busyLibrary && styles.disabled]}
          onPress={onImportLibrary}
          disabled={!!busyLibrary}
        >
          {busyLibrary === 'import' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="download-outline" size={18} color={colors.accent} />
          )}
          <Text style={styles.rowButtonText}>Import Pustaka (.db)</Text>
        </Pressable>
        {libraryMessage ? (
          <Text style={styles.descText}>{libraryMessage}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Tentang</Text>
      <View style={styles.card}>
        <Text style={styles.versionText}>Shinigami Manga</Text>
        <Text style={styles.descText}>
          Versi {getCurrentVersion()} (build {buildNumber})
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    padding: 16,
  },
  versionText: {
    color: colors.secondaryText,
    fontSize: 13,
  },
  descText: {
    color: colors.secondaryText,
    fontSize: 13,
    marginTop: 6,
  },
  notesText: {
    color: colors.text,
    fontSize: 13,
    marginTop: 8,
  },
  okText: {
    color: '#4CAF50',
    fontSize: 13,
    marginTop: 8,
  },
  errText: {
    color: '#F44336',
    fontSize: 13,
    marginTop: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  loadingText: {
    color: colors.secondaryText,
    fontSize: 13,
    marginLeft: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#101010',
    fontSize: 14,
    fontWeight: '700',
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    gap: 8,
  },
  rowButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
