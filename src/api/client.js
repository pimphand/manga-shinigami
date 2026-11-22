import axios from 'axios';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.shinigami.io/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

export const getMangaLists = (q, offset = 0) =>
  api.get('/manga/list', {
    params: {
      sort: 'latest',
      sort_order: 'desc',
      offset,
      limit: 24,
      ...(q ? { q } : {}),
    },
  });
export const getTaxonomyList = (type) =>
  api.get('/taxonomy/list', { params: { type } });
export const getHomeHero = () =>
  api.get('/manga/recommendation/lists/home-hero');
export const getHome = () => api.get('/manga/recommendation/lists/home');
export const getMangaDetail = (id) => api.get(`/manga/detail/${id}`);
export const getChapterDetail = (chapterId) =>
  api.get(`/chapter/detail/${chapterId}`);
export const getChapterList = (mangaId, params) =>
  api.get(`/chapter/${mangaId}/list`, {
    params: {
      sort_by: 'chapter_number',
      sort_order: 'desc',
      limit: 100,
      ...params,
    },
  });

export function extractChapterPage(data) {
  const items = extractItems(data);
  const meta = data?.meta || data?.data?.meta || {};
  const nextCursor = meta.next_cursor ?? meta.nextCursor ?? null;
  const hasNext =
    typeof meta.has_next === 'boolean'
      ? meta.has_next
      : typeof meta.hasNext === 'boolean'
        ? meta.hasNext
        : Boolean(nextCursor);
  return { items, hasNext, nextCursor };
}

export function extractItems(data) {
  if (!data) return [];
  const list = Array.isArray(data)
    ? data
    : data?.data?.mangas || data?.data || data?.items || data?.manga || [];
  if (!Array.isArray(list)) return [];
  return list.flat().filter(Boolean);
}

export function chapterPageUrls(detail) {
  const chapter = detail?.chapter;
  if (!chapter?.path || !Array.isArray(chapter?.data)) return [];
  const base = detail?.base_url || '';
  return chapter.data.map((file) => `${base}${chapter.path}${file}`);
}

export function normalizeChapter(item) {
  return {
    ...item,
    id: item?.id ?? item?.chapter_id,
  };
}

export function normalizeManga(item) {
  return {
    ...item,
    id: item?.id ?? item?.manga_id,
    title: item?.title ?? item?.name,
    cover:
      item?.thumbnail_image_url ??
      item?.cover ??
      item?.cover_image_url ??
      item?.cover_portrait_url,
  };
}

export default api;
