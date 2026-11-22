import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import colors from '../theme';

function timeAgo(dateString) {
  const time = new Date(dateString).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari yang lalu`;
  return new Date(time).toLocaleDateString();
}

function ChapterItem({ chapter, onPress }) {
  const number =
    chapter?.chapter_number ?? chapter?.number ?? chapter?.chapter ?? '?';
  const title = chapter?.chapter_title || chapter?.title;
  const thumbnail = chapter?.thumbnail_image_url;
  const date = chapter?.release_date || chapter?.created_at;

  return (
    <Pressable style={styles.row} onPress={() => onPress?.(chapter)}>
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.thumbnail, styles.badge]}>
          <Text style={styles.badgeText}>#{number}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {title || `Chapter ${number}`}
        </Text>
        {date ? (
          <Text style={styles.sub}>{timeAgo(date)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default React.memo(ChapterItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumbnail: {
    width: 96,
    height: 54,
    borderRadius: 6,
    backgroundColor: colors.secondaryBackground,
    marginRight: 12,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sub: {
    color: colors.secondaryText,
    fontSize: 12,
    marginTop: 2,
  },
});
