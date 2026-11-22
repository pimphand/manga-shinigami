import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import colors from '../theme';
import {
  checkForUpdate,
  downloadAndInstallApk,
  getCurrentVersion,
} from '../lib/appUpdate';

export default function ProfileScreen() {
  const { history } = useLibrary();
  const [user, setUser] = useState({ name: 'Pengguna', avatar: colors.accent });
  const [settings, setSettings] = useState({
    notifications: true,
    autoDownload: false,
  });
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | available | downloading | uptodate | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [progress, setProgress] = useState(0);

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
      setUpdateState('error');
      setUpdateError(e?.message || 'Gagal mengunduh pembaruan');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: user.avatar }]}>
          <Text style={styles.avatarText}>
            {(user.name || 'K').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.stats}>
          {history.length} chapter dibaca
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Pengaturan</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Notifikasi</Text>
        <Switch
          value={settings.notifications}
          onValueChange={() => toggleSetting('notifications')}
          thumbColor="#101010"
          trackColor={{ false: colors.inactive, true: colors.accent }}
        />
      </View>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Auto download chapter</Text>
        <Switch
          value={settings.autoDownload}
          onValueChange={() => toggleSetting('autoDownload')}
          thumbColor="#101010"
          trackColor={{ false: colors.inactive, true: colors.accent }}
        />
      </View>

      <Text style={styles.sectionTitle}>Aplikasi</Text>
      <View style={styles.updateCard}>
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
        {updateState === 'downloading' ? (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
        {(updateState === 'checking' || updateState === 'downloading') ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>
              {updateState === 'checking'
                ? 'Memeriksa pembaruan...'
                : `Mengunduh... ${Math.round(progress * 100)}%`}
            </Text>
          </View>
        ) : updateState === 'available' ? (
          <Pressable style={styles.updateButton} onPress={onDownloadUpdate}>
            <Text style={styles.updateButtonText}>
              Unduh & Instal v{updateInfo.latest}
              {updateInfo.assetSize ? ` (${(updateInfo.assetSize / 1024 / 1024).toFixed(1)} MB)` : ''}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.updateButton} onPress={onCheckUpdate}>
            <Text style={styles.updateButtonText}>Cek Pembaruan</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 16,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    marginHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: colors.background,
    fontSize: 32,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  stats: {
    color: colors.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLabel: {
    color: colors.text,
    fontSize: 14,
  },
  updateCard: {
    marginHorizontal: 16,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    padding: 16,
  },
  versionText: {
    color: colors.secondaryText,
    fontSize: 13,
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
  updateButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  updateButtonText: {
    color: '#101010',
    fontSize: 14,
    fontWeight: '700',
  },
});
