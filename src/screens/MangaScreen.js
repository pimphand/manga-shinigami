import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppButton from '../components/common/AppButton';
import Loading from '../components/common/Loading';
import colors from '../theme';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STATUS_OPTIONS = [
  { label: 'Semua', value: 'all' },
  { label: 'Ongoing', value: 1 },
  { label: 'Tamat', value: 2 },
];
const FORMAT_OPTIONS = ['Semua', 'Manhwa', 'Manga', 'Manhua'];
const TYPE_OPTIONS = ['Semua', 'Project', 'Mirror'];

const taxNames = (item, key) => (item?.taxonomy?.[key] || []).map((t) => t.name);
const CHIP_ALL = 'Semua';

function Chips({ options, selected, onSelect }) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const value = opt?.value ?? opt;
        const label = opt?.label ?? opt;
        const active = selected === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => onSelect(value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { extractItems, getMangaLists, normalizeManga } from '../api/client';
import MangaCard from '../components/MangaCard';

export default function MangaScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [mangaList, setMangaList] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [status, setStatus] = useState('all');
  const [format, setFormat] = useState(CHIP_ALL);
  const [type, setType] = useState(CHIP_ALL);
  const [genre, setGenre] = useState(CHIP_ALL);

  const genres = useMemo(
    () => [CHIP_ALL, ...new Set(mangaList.flatMap((m) => taxNames(m, 'Genre')))],
    [mangaList]
  );

  const activeCount = [status !== 'all', format !== CHIP_ALL, type !== CHIP_ALL, genre !== CHIP_ALL].filter(Boolean).length;

  const resetFilters = () => {
    setStatus('all');
    setFormat(CHIP_ALL);
    setType(CHIP_ALL);
    setGenre(CHIP_ALL);
  };

  // Request pencarian basi dibatalkan: hasil query lama yang pulang
  // belakangan tidak boleh menimpa hasil query terbaru (race condition).
  const searchAbort = useRef(null);

  const loadManga = useCallback(async (search = '', offset = 0) => {
    const append = offset > 0;
    let signal;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      searchAbort.current?.abort();
      searchAbort.current = new AbortController();
      signal = searchAbort.current.signal;
    }
    setError(null);
    try {
      const res = await getMangaLists(search.trim(), offset, signal);
      const items = extractItems(res.data).map(normalizeManga);
      setMangaList((prev) => (append ? [...prev, ...items] : items));
      setHasNext(Boolean(res.data?.meta?.has_next));
    } catch (e) {
      // Abort yang disengaja bukan error: abaikan diam-diam.
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
      setError(e?.message || 'Gagal memuat daftar manga');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
    },
    []
  );

  const loadMore = () => {
    if (loadingMore || loading || !hasNext) return;
    loadManga(query, mangaList.length);
  };

  useEffect(() => {
    const timer = setTimeout(() => loadManga(query), 400);
    return () => clearTimeout(timer);
  }, [query, loadManga]);

  const filtered = useMemo(() => mangaList.filter((m) => {
    const matchesStatus = status === 'all' || m?.status === status;
    const matchesFormat = format === CHIP_ALL || taxNames(m, 'Format').includes(format);
    const matchesType = type === CHIP_ALL || taxNames(m, 'Type').includes(type);
    const matchesGenre = genre === CHIP_ALL || taxNames(m, 'Genre').includes(genre);
    return matchesStatus && matchesFormat && matchesType && matchesGenre;
  }), [mangaList, status, format, type, genre]);

  const openDetail = useCallback(
    (manga) => {
      navigation.navigate('Home', {
        screen: 'Detail',
        params: { id: manga?.id },
      });
    },
    [navigation]
  );

  const renderManga = useCallback(
    ({ item }) => (
      <MangaCard manga={item} onPress={openDetail} style={styles.card} />
    ),
    [openDetail]
  );

  const keyExtractor = useCallback(
    (item, index) => item?.id ?? String(index),
    []
  );

  return (
    <View style={styles.container}>
      <View style={[styles.searchBox, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, styles.searchFlex]}
            placeholder="Cari manga..."
            placeholderTextColor="#666666"
            value={query}
            onChangeText={setQuery}
          />
          <Pressable style={styles.filterButton} onPress={() => setFilterOpen(true)}>
            <Text style={styles.filterButtonText}>
              Filter{activeCount ? ` (${activeCount})` : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter</Text>
              <Pressable onPress={resetFilters}>
                <Text style={styles.clearText}>Hapus semua</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.filterLabel}>Status</Text>
              <Chips options={STATUS_OPTIONS} selected={status} onSelect={setStatus} />
              <Text style={styles.filterLabel}>Format</Text>
              <Chips options={FORMAT_OPTIONS} selected={format} onSelect={setFormat} />
              <Text style={styles.filterLabel}>Tipe</Text>
              <Chips options={TYPE_OPTIONS} selected={type} onSelect={setType} />
              <Text style={styles.filterLabel}>Genre</Text>
              <Chips options={genres} selected={genre} onSelect={setGenre} />
            </ScrollView>
            <Pressable style={styles.applyButton} onPress={() => setFilterOpen(false)}>
              <Text style={styles.applyButtonText}>Tampilkan hasil</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {loading ? (
        <Loading />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderManga}
          keyExtractor={keyExtractor}
          numColumns={2}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Tidak ada manga ditemukan</Text>
          }
          ListFooterComponent={
            hasNext ? (
              <AppButton
                title="Tampilkan lebih banyak"
                variant="outline"
                style={styles.moreButton}
                onPress={loadMore}
                loading={loadingMore}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBox: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.secondaryBackground,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  grid: {
    padding: 12,
  },
  card: {
    flex: 1,
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
  },
  emptyText: {
    color: colors.inactive,
    textAlign: 'center',
    paddingVertical: 40,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchFlex: {
    flex: 1,
  },
  filterButton: {
    marginLeft: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  clearText: {
    color: colors.accent,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    maxHeight: '80%',
    backgroundColor: colors.secondaryBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  filterLabel: {
    color: colors.mutedText,
    fontSize: 13,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.lightText,
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  applyButton: {
    marginHorizontal: 16,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    alignSelf: 'center',
    marginVertical: 12,
  },
  applyButtonText: {
    color: colors.background,
    fontWeight: '600',
    fontSize: 14,
  },
});
