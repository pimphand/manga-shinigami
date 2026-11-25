import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = '@shinigami_manga:favorites';
const HISTORY_KEY = '@shinigami_manga:history';

const LibraryContext = createContext(undefined);

export function LibraryProvider({ children }) {
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    (async () => {
      const [fav, hist] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(HISTORY_KEY),
      ]);
      setFavorites(fav ? JSON.parse(fav) : []);
      setHistory(hist ? JSON.parse(hist) : []);
    })();
  }, []);

  const toggleFavorite = useCallback((mangaId) => {
    setFavorites((prev) => {
      const next = prev.includes(mangaId)
        ? prev.filter((id) => id !== mangaId)
        : [...prev, mangaId];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addHistory = useCallback((entry) => {
    setHistory((prev) => {
      const next = [
        {
          mangaId: entry?.mangaId,
          mangaTitle: entry?.mangaTitle,
          mangaCover:
            entry?.mangaCover ??
            entry?.cover ??
            entry?.thumbnail ??
            null,
          chapterId: entry?.chapterId,
          chapterNumber: entry?.chapterNumber,
          chapterTitle: entry?.chapterTitle ?? null,
          timestamp: entry?.timestamp || Date.now(),
          currentPage: entry?.currentPage ?? 0,
          totalPages: entry?.totalPages ?? 0,
        },
        ...prev.filter(
          (h) =>
            h?.chapterId !== entry?.chapterId ||
            h?.mangaId !== entry?.mangaId
        ),
      ].slice(0, 100);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Dipakai Reader saat pindah chapter / menyimpan progres halaman:
  // update entri manga yang sama (pertahankan judul & cover lama),
  // atau buat entri minimal kalau belum ada riwayat untuk manga ini.
  const updateHistoryEntry = useCallback((mangaId, patch) => {
    if (mangaId == null) return;
    setHistory((prev) => {
      const idx = prev.findIndex(
        (h) => String(h?.mangaId) === String(mangaId)
      );
      let next;
      if (idx >= 0) {
        const merged = {
          ...prev[idx],
          ...patch,
          mangaId: prev[idx]?.mangaId ?? mangaId,
          timestamp: patch?.timestamp || Date.now(),
        };
        next = [merged, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      } else {
        next = [
          {
            mangaId,
            mangaTitle: patch?.mangaTitle ?? 'Manga',
            mangaCover: patch?.mangaCover ?? null,
            chapterId: patch?.chapterId ?? null,
            chapterNumber: patch?.chapterNumber ?? null,
            chapterTitle: patch?.chapterTitle ?? null,
            timestamp: patch?.timestamp || Date.now(),
            currentPage: patch?.currentPage ?? 0,
            totalPages: patch?.totalPages ?? 0,
          },
          ...prev,
        ];
      }
      const sliced = next.slice(0, 100);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(sliced));
      return sliced;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  }, []);

  const replaceLibrary = useCallback(async ({ favorites: favs = [], history: hist = [] } = {}) => {
    const cleanFavs = [
      ...new Set(
        (Array.isArray(favs) ? favs : [])
          .filter((id) => id != null)
          .map((id) => String(id))
      ),
    ];
    const cleanHist = (Array.isArray(hist) ? hist : [])
      .filter((h) => h?.chapterId != null)
      .slice(0, 100);
    setFavorites(cleanFavs);
    setHistory(cleanHist);
    await Promise.all([
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(cleanFavs)),
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(cleanHist)),
    ]);
  }, []);

  // value di-memo supaya konsumen context tidak re-render hanya karena
  // Provider me-render ulang tanpa perubahan data yang relevan.
  const value = useMemo(
    () => ({
      favorites,
      history,
      toggleFavorite,
      addHistory,
      updateHistoryEntry,
      clearHistory,
      replaceLibrary,
    }),
    [favorites, history, toggleFavorite, addHistory, updateHistoryEntry, clearHistory, replaceLibrary]
  );

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within LibraryProvider');
  }
  return ctx;
}
