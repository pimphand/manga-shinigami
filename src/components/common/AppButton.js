import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import colors from '../../theme';

// variant: 'primary' (accent fill), 'outline' (accent border), 'secondary' (card fill)
export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) {
  const variantStyle = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, variantStyle.container, disabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color} />
      ) : (
        <Text style={[styles.text, variantStyle.text, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: {
    container: { backgroundColor: colors.accent },
    text: { color: colors.background },
  },
  outline: {
    container: { borderWidth: 1, borderColor: colors.accent },
    text: { color: colors.accent },
  },
  secondary: {
    container: { backgroundColor: colors.card },
    text: { color: colors.text },
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
