import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/common/AppButton';
import Loading from '../components/common/Loading';
import { useLibrary } from '../context/LibraryContext';
import MangaCard from '../components/MangaCard';
import { getMangaDetail } from '../api/client';
import colors from '../theme';

const PAGE_SIZE = 10;

function timeAgo(input) {
  const time = new Date(input).getTime();
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

// Baris riwayat di-memo: hanya re-render jika entri-nya sendiri berubah.
const HistoryRow = memo(function HistoryRow({ entry, onOpen }) {
  const cover = entry?.mangaCover ?? entry?.cover ?? entry?.thumbnail ?? null;
  const number = entry?.chapterNumber ?? entry?.chapter_number ?? '?';
  const chapterTitle = entry?.chapterTitle || entry?.chapter_title || '';
  return (
    <Pressable style={styles.historyRow} onPress={() => onOpen(entry)}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={styles.historyThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.historyThumb, styles.historyBadge]}>
          <Text style={styles.historyBadgeText}>#{number}</Text>
        </View>
      )}
      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle} numberOfLines={2}>
          {entry?.mangaTitle ?? 'Manga'}
        </Text>
        <Text style={styles.historySub} numberOfLines={1}>
          Terakhir dibaca: Chapter {number}
          {chapterTitle ? ` - ${chapterTitle}` : ''}
        </Text>
        {entry?.timestamp ? (
          <Text style={styles.historyTime} numberOfLines={1}>
            {timeAgo(entry.timestamp)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export default function LibraryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { favorites, history, clearHistory } = useLibrary();
  const [favManga, setFavManga] = useState([]);
  const [loadingFavs, setLoadingFavs] = useState(false);
  const [favLimit, setFavLimit] = useState(PAGE_SIZE);
  const [historyLimit, setHistoryLimit] = useState(PAGE_SIZE);

  // Satu judul tampil satu kali saja: ambil entri TERAKHIR dibaca per manga.
  // history urut terbaru dulu, jadi kemunculan pertama per mangaId menang.
  const uniqueHistory = useMemo(() => {
    const seen = new Set();
    return history.filter((h) => {
      const key = h?.mangaId != null ? String(h.mangaId) : `chapter:${h?.chapterId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [history]);

  // Cache detail favorit selama sesi: ID yang sudah pernah dimuat tidak
  // di-request ulang saat daftar favorit berubah (tambah/hapus favorit
  // lain hanya memuat yang belum ada di cache).
  const favCache = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (const key of favCache.current.keys()) {
        if (!favorites.includes(key)) favCache.current.delete(key);
      }
      if (favorites.length === 0) {
        setFavManga([]);
        setLoadingFavs(false);
        return;
      }
      const missing = favorites.filter((id) => !favCache.current.has(id));
      if (missing.length === 0) {
        setFavManga(
          favorites.map((id) => favCache.current.get(id)).filter(Boolean)
        );
        setLoadingFavs(false);
        return;
      }
      setLoadingFavs(true);
      const details = await Promise.all(
        missing.map((id) =>
          getMangaDetail(id).then((r) => r.data).catch(() => null)
        )
      );
      if (!cancelled) {
        details.forEach((d, i) => {
          if (d) favCache.current.set(missing[i], d);
        });
        setFavManga(
          favorites.map((id) => favCache.current.get(id)).filter(Boolean)
        );
        setLoadingFavs(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const openDetail = useCallback(
    (manga) => {
      navigation.navigate('Home', {
        screen: 'Detail',
        params: { id: manga?.id },
      });
    },
    [navigation]
  );

  const openReader = useCallback(
    (entry) => {
      navigation.navigate('Home', {
        screen: 'Reader',
        params: {
          mangaId: entry?.mangaId,
          chapterId: entry?.chapterId,
          mangaTitle: entry?.mangaTitle,
          mangaCover: entry?.mangaCover ?? entry?.cover ?? entry?.thumbnail ?? null,
        },
      });
    },
    [navigation]
  );

  const renderFavorite = useCallback(
    ({ item }) => (
      <MangaCard manga={item} onPress={openDetail} style={styles.favCard} />
    ),
    [openDetail]
  );

  const renderHistory = useCallback(
    ({ item }) => <HistoryRow entry={item} onOpen={openReader} />,
    [openReader]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
    >
      <Text style={styles.sectionTitle}>Favorit</Text>
      {favorites.length === 0 ? (
        <Text style={styles.emptyText}>Belum ada manga favorit</Text>
      ) : loadingFavs ? (
        <Loading />
      ) : (
        <View style={styles.grid}>
          {favManga.slice(0, favLimit).map((item, index) => (
            <View key={item?.id ?? String(index)} style={styles.gridItem}>
              {renderFavorite({ item })}
            </View>
          ))}
        </View>
      )}
      {favManga.length > favLimit && (
        <AppButton
          title="Tampilkan lebih banyak"
          variant="outline"
          style={styles.moreButton}
          onPress={() => setFavLimit((n) => n + PAGE_SIZE)}
        />
      )}

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>Riwayat Membaca</Text>
        {uniqueHistory.length > 0 ? (
          <Pressable onPress={clearHistory}>
            <Text style={styles.clearText}>Bersihkan</Text>
          </Pressable>
        ) : null}
      </View>
      {uniqueHistory.length === 0 ? (
        <Text style={styles.emptyText}>Belum ada riwayat membaca</Text>
      ) : (
        <View style={styles.historyList}>
          {uniqueHistory.slice(0, historyLimit).map((item, index) => (
            <View key={String(item?.chapterId ?? index)}>{renderHistory({ item })}</View>
          ))}
        </View>
      )}
      {uniqueHistory.length > historyLimit && (
        <AppButton
          title="Tampilkan lebih banyak"
          variant="outline"
          style={styles.moreButton}
          onPress={() => setHistoryLimit((n) => n + PAGE_SIZE)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  favCard: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    color: colors.background,
    backgroundColor: colors.text,
    fontSize: 16,
    fontWeight: '700',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  clearText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  gridItem: {
    width: '50%',
    padding: 4,
  },
  historyList: {
    paddingHorizontal: 16,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyThumb: {
    width: 56,
    height: 76,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
    marginRight: 12,
  },
  historyBadge: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  historySub: {
    color: colors.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  historyTime: {
    color: colors.inactive,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: colors.inactive,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  moreButton: {
    alignSelf: 'center',
    marginTop: 12,
  },
});
