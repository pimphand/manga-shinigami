import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import colors from '../theme';

const SEED_POSTS = [
  {
    id: '1',
    user: 'ShinigamiReader',
    content: 'Chapter terbaru benar-benar pas!',
    likes: 12,
    timestamp: Date.now() - 86400000,
  },
  {
    id: '2',
    user: 'MangaExplorer',
    content: 'Cerita ini topiknya seru banget.',
    likes: 8,
    timestamp: Date.now() - 172800000,
  },
];

export default function CommunityScreen() {
  const [posts, setPosts] = useState(SEED_POSTS);
  const [draft, setDraft] = useState('');

  const addPost = () => {
    const content = draft.trim();
    if (!content) return;
    setPosts([
      {
        id: String(Date.now()),
        user: 'Kamu',
        content,
        likes: 0,
        timestamp: Date.now(),
      },
      ...posts,
    ]);
    setDraft('');
  };

  const toggleLike = (id) => {
    setPosts(
      posts.map((p) =>
        p.id === id ? { ...p, likes: p.likes + 1 } : p
      )
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Postingan Komunitas</Text>
      {posts.map((p) => (
        <View key={p.id} style={styles.post}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(p.user || 'K').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.postInfo}>
            <Text style={styles.postUser}>{p.user}</Text>
            <Text style={styles.postContent}>{p.content}</Text>
            <Pressable onPress={() => toggleLike(p.id)}>
              <Text style={styles.likeText}>Likes: {p.likes}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Tulis Postingan</Text>
      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Bagikan opini kamu..."
          placeholderTextColor="#666666"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable style={styles.composerButton} onPress={addPost}>
          <Text style={styles.composerButtonText}>Kirim</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  post: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  postInfo: {
    flex: 1,
  },
  postUser: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  postContent: {
    color: colors.secondaryText,
    fontSize: 13,
    marginTop: 2,
  },
  likeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  composer: {
    marginHorizontal: 16,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 8,
    padding: 8,
  },
  composerInput: {
    color: colors.text,
    minHeight: 60,
  },
  composerButton: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  composerButtonText: {
    color: colors.background,
    fontWeight: '700',
  },
});
