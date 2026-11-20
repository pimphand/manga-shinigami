import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  return (
    <LibraryContext.Provider
      value={{
        favorites,
        history,
        toggleFavorite,
        addHistory,
        clearHistory,
        replaceLibrary,
      }}
    >
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
