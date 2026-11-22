import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { extractChapterPage, getChapterList, getMangaDetail, normalizeChapter } from '../api/client';
import colors from '../theme';
import Loading from '../components/common/Loading';

const CHAPTER_PAGE_SIZE = 100;

export default function DetailScreen({ route }) {
  const { id } = route.params || {};
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { favorites, toggleFavorite, addHistory, history } = useLibrary();
  const [starting, setStarting] = useState(false);

  // Entri terakhir yang dibaca untuk komik ini (history urut terbaru dulu).
  const lastRead = history.find((h) => String(h?.mangaId) === String(id));
  const [detail, setDetail] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreChapters, setHasMoreChapters] = useState(true);
  const [chapterCursor, setChapterCursor] = useState(null);
  const [error, setError] = useState(null);

  const sortChaptersDesc = (list) =>
    [...list].sort(
      (a, b) => (b?.chapter_number ?? 0) - (a?.chapter_number ?? 0)
    );

  const fetchChapterPage = useCallback(
    async (cursor) => {
      const chapterRes = await getChapterList(id, {
        limit: CHAPTER_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      const { items, hasNext, nextCursor } = extractChapterPage(
        chapterRes.data
      );
      return { list: items.map(normalizeChapter), hasNext, nextCursor };
    },
    [id]
  );

  const loadDetail = useCallback(async () => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detailRes, firstPage] = await Promise.all([
          getMangaDetail(id),
          fetchChapterPage(null),
        ]);
        setDetail(detailRes.data?.data ?? detailRes.data);
        setChapters(sortChaptersDesc(firstPage.list));
        setChapterCursor(firstPage.nextCursor);
        setHasMoreChapters(firstPage.hasNext);
      } catch (e) {
        setError(e?.message || 'Gagal memuat detail manga');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, fetchChapterPage]);

  const loadMoreChapters = useCallback(async () => {
    if (loading || loadingMore || !hasMoreChapters) return;
    setLoadingMore(true);
    try {
      const page = await fetchChapterPage(chapterCursor);
      if (page.list.length === 0) {
        setHasMoreChapters(false);
        return;
      }
      setChapters((prev) => {
        const merged = [...prev, ...page.list];
        const seen = new Set();
        const unique = merged.filter((ch) => {
          const key = ch?.id ?? ch?.chapter_number;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return sortChaptersDesc(unique);
      });
      setChapterCursor(page.nextCursor);
      setHasMoreChapters(page.hasNext);
    } catch (e) {
      // Biarkan daftar yang sudah ada tetap tampil; coba lagi saat scroll.
    } finally {
      setLoadingMore(false);
    }
  }, [id, loading, loadingMore, hasMoreChapters, chapterCursor, fetchChapterPage]);

  const loadMoreRef = useRef(loadMoreChapters);
  loadMoreRef.current = loadMoreChapters;

  const handleScroll = useCallback(({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const nearBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
    if (nearBottom) loadMoreRef.current?.();
  }, []);

  const onFocus = useCallback(() => {
    loadDetail();
  }, [loadDetail]);

  useFocusEffect(onFocus);

  const getFirstChapter = useCallback(async () => {
    // Chapter 1 = nomor terkecil. Kalau semua halaman sudah dimuat,
    // ambil dari daftar lokal; kalau belum, minta 1 item ascending ke API.
    if (!hasMoreChapters && chapters.length > 0) {
      return [...chapters].sort(
        (a, b) => (a?.chapter_number ?? 0) - (b?.chapter_number ?? 0)
      )[0];
    }
    const res = await getChapterList(id, {
      sort_by: 'chapter_number',
      sort_order: 'asc',
      limit: 1,
    });
    return extractChapterPage(res.data).items.map(normalizeChapter)[0];
  }, [id, hasMoreChapters, chapters]);

  const onStartReading = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const first = await getFirstChapter();
      if (!first) {
        Alert.alert('Gagal', 'Chapter 1 tidak ditemukan');
        return;
      }
      onRead(first);
    } catch (e) {
      Alert.alert('Gagal', e?.message || 'Gagal memuat chapter 1');
    } finally {
      setStarting(false);
    }
  }, [starting, getFirstChapter]);

  const onContinue = useCallback(() => {
    if (!lastRead) return;
    onRead({
      id: lastRead.chapterId,
      chapter_number: lastRead.chapterNumber,
      chapter_title: lastRead.chapterTitle,
    });
  }, [lastRead]);

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
      scrollEventThrottle={16}
      onScroll={handleScroll}
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

      <View style={styles.actionRow}>
        {lastRead ? (
          <>
            <Pressable style={styles.primaryButton} onPress={onContinue}>
              <Ionicons name="play" size={18} color="#000" />
              <Text style={styles.primaryText}>
                Lanjutkan Baca — Ch. {lastRead.chapterNumber ?? ''}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={onStartReading}
              disabled={starting}
            >
              {starting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.secondaryText}>Ulangi dari Chapter 1</Text>
              )}
            </Pressable>
          </>
        ) : (
          <Pressable
            style={styles.primaryButton}
            onPress={onStartReading}
            disabled={starting}
          >
            {starting ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.primaryText}>Mulai Baca</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>Daftar Chapter</Text>
      {chapters.length > 0 ? (
        chapters.map((ch) => (
          <ChapterItem key={ch.id ?? ch.chapter_number} chapter={ch} onPress={() => onRead(ch)} />
        ))
      ) : (
        <Text style={styles.emptyText}>Belum ada chapter</Text>
      )}
      {loadingMore ? (
        <View style={styles.loadMore}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadMoreText}>Memuat chapter lainnya...</Text>
        </View>
      ) : null}
      {!hasMoreChapters && chapters.length > 0 ? (
        <Text style={styles.endText}>Semua chapter sudah dimuat</Text>
      ) : null}
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
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    color: colors.secondaryText,
    fontSize: 13,
  },
  endText: {
    color: colors.inactive,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
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
  actionRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  primaryText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
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
