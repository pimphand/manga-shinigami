import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import colors from '../theme';

// Di-memo: daftar hanya me-render ulang kartu yang datanya berubah.
// onPress dipanggil dengan manga (bukan closure per-baris) supaya
// identitas prop tetap stabil dari induk yang memakai useCallback.
function MangaCard({ manga, onPress, style }) {
  const title = manga?.title || manga?.name || 'Manga';
  const cover = manga?.cover || manga?.image || manga?.imageUrl;

  return (
    <Pressable style={[styles.card, style]} onPress={() => onPress?.(manga)}>
      <Image
        source={{ uri: cover }}
        style={styles.cover}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

export default React.memo(MangaCard);

const styles = StyleSheet.create({
  card: {
    margin: 6,
    backgroundColor: colors.card,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: 180,
    backgroundColor: colors.secondaryBackground,
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    padding: 6,
    paddingTop: 8,
  },
});
