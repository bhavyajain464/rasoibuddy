import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { Avatar, Text } from 'react-native-paper';
import { openProfile } from '../navigation/rootNavigation';
import { useAuth } from '../context/AuthContext';
import { palette } from '../theme';

type Props = {
  size?: number;
  showLabel?: boolean;
};

export function ProfileHeaderButton({ size = 40, showLabel = true }: Props) {
  const { user } = useAuth();
  const label = user?.name?.charAt(0).toUpperCase() || 'P';

  return (
    <Pressable
      onPress={() => openProfile()}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={8}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      {showLabel ? (
        <Text style={styles.linkText}>Profile</Text>
      ) : null}
      {user?.picture_url ? (
        <Image source={{ uri: user.picture_url }} style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <Avatar.Text
          size={size}
          label={label}
          style={styles.avatar}
          labelStyle={[styles.avatarLabel, { fontSize: size * 0.4 }]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  pressed: { opacity: 0.85 },
  linkText: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  avatar: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  avatarLabel: {
    color: palette.primary,
    fontWeight: '700',
  },
  avatarImage: {
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
});
