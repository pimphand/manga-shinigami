import React from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
import colors from '../theme';

export default function MangaCard({ manga, onPress, style }) {
  const title = manga?.title || manga?.name || 'Manga';
  const cover = manga?.cover || manga?.image || manga?.imageUrl;

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <Image
        source={{ uri: cover }}
        style={styles.cover}
        contentFit="cover"
      />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

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
