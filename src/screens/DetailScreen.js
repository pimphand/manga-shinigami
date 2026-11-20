import React, { useCallback, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLibrary } from '../context/LibraryContext';
import ChapterItem from '../components/ChapterItem';
import { extractItems, getChapterList, getMangaDetail, normalizeChapter } from '../api/client';
import colors from '../theme';
import Loading from '../components/common/Loading';

export default function DetailScreen({ route }) {
  const { id } = route.params || {};
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { favorites, toggleFavorite, addHistory } = useLibrary();
  const [detail, setDetail] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDetail = useCallback(async () => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detailRes, chapterRes] = await Promise.all([
          getMangaDetail(id),
          getChapterList(id),
        ]);
        setDetail(detailRes.data?.data ?? detailRes.data);
        const list = extractItems(chapterRes.data).map(normalizeChapter);
        const sorted = [...list].sort(
          (a, b) => (b?.chapter_number ?? 0) - (a?.chapter_number ?? 0)
        );
        setChapters(sorted);
      } catch (e) {
        setError(e?.message || 'Gagal memuat detail manga');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const onFocus = useCallback(() => {
    loadDetail();
  }, [loadDetail]);

  useFocusEffect(onFocus);

  const onRead = (chapter) => {
    const chapterId =
      chapter?.id ?? String(chapter?.chapter_number ?? chapter?.number ?? '');
    const detailCover =
      detail?.cover ||
      detail?.cover_image_url ||
      detail?.image ||
      detail?.imageUrl ||
      detail?.thumbnail_image_url ||
      null;
    addHistory({
      mangaId: id,
      mangaTitle: detail?.title || detail?.name,
      mangaCover: detailCover,
      chapterId,
      chapterNumber: chapter?.chapter_number ?? chapter?.number,
      chapterTitle: chapter?.chapter_title || chapter?.title || null,
      timestamp: Date.now(),
    });
    navigation.navigate('Reader', { mangaId: id, chapterId, chapter });
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Detail manga tidak ditemukan</Text>
      </View>
    );
  }

  const isFavorite = favorites.includes(id);
  const cover = detail?.cover || detail?.cover_image_url || detail?.image || detail?.imageUrl;
  const title = detail?.title || detail?.name || 'Manga';
  const synopsis = detail?.synopsis || detail?.description || '';
  const genres = (detail?.taxonomy?.Genre || []).map((g) => g.name).join(', ');
  const author = (detail?.taxonomy?.Author || []).map((a) => a.name).join(', ');
  const year = detail?.year || detail?.release_year;
  const statusLabel = detail?.status === 1 ? 'Ongoing' : detail?.status === 2 ? 'Completed' : detail?.status;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.header}>
        <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
            <Pressable onPress={() => toggleFavorite(id)} style={styles.favButton}>
              <Ionicons
                name={isFavorite ? 'bookmark' : 'bookmark-outline'}
                size={26}
                color={isFavorite ? colors.accent : colors.text}
              />
            </Pressable>
          </View>
          {synopsis ? <Text style={styles.synopsis}>{synopsis}</Text> : null}
          <View>
            {statusLabel ? (
              <Text style={styles.infoText}>Status: {statusLabel}</Text>
            ) : null}
            {year ? <Text style={styles.infoText}>Year: {year}</Text> : null}
            {author ? <Text style={styles.infoText}>Author: {author}</Text> : null}
            {genres ? <Text style={styles.infoText}>Genres: {genres}</Text> : null}
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Daftar Chapter</Text>
      {chapters.length > 0 ? (
        chapters.map((ch) => (
          <ChapterItem key={ch.id ?? ch.chapter_number} chapter={ch} onPress={() => onRead(ch)} />
        ))
      ) : (
        <Text style={styles.emptyText}>Belum ada chapter</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.secondaryText,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.inactive,
    textAlign: 'center',
    paddingVertical: 24,
  },
  header: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.background,
  },
  cover: {
    width: 140,
    height: 190,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  favButton: {
    padding: 4,
    marginLeft: 8,
  },
  synopsis: {
    color: colors.secondaryText,
    fontSize: 13,
    marginTop: 8,
  },
  infoText: {
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
    paddingBottom: 4,
  },
});
