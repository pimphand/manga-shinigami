import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import colors from '../theme';

function HeroCarousel({ items, onSelect }) {
  const { width } = useWindowDimensions();

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.carousel}
      contentContainerStyle={styles.carouselContent}
    >
      {items.map((item, i) => {
        const image = item?.cover || item?.image || item?.imageUrl;
        const title = item?.title || item?.name || 'Shinigami';
        return (
          <Pressable
            key={item?.id ?? String(i)}
            style={[styles.page, { width, height: width * 0.56 }]}
            onPress={() => onSelect && onSelect(item)}
          >
            <Image
              source={{ uri: image }}
              style={styles.pageImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default React.memo(HeroCarousel);

const styles = StyleSheet.create({
  carousel: {
    marginHorizontal: -16,
  },
  carouselContent: {
    paddingHorizontal: 16,
  },
  page: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  pageImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
