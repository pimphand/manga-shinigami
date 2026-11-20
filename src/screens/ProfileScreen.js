import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import colors from '../theme';

export default function ProfileScreen() {
  const { history } = useLibrary();
  const [user, setUser] = useState({ name: 'Pengguna', avatar: colors.accent });
  const [settings, setSettings] = useState({
    notifications: true,
    autoDownload: false,
  });

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
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
});
