import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Avatar } from 'react-native-paper';
import { openProfile } from '../navigation/rootNavigation';
import { useAuth } from '../context/AuthContext';

type Props = {
  /** Avatar on colored headers (Home, Inventory, …). */
  variant?: 'onColor' | 'light';
  size?: number;
};

export function ProfileHeaderButton({ variant = 'onColor', size = 44 }: Props) {
  const { user } = useAuth();
  const label = user?.name?.charAt(0).toUpperCase() || 'U';

  return (
    <Pressable
      onPress={() => openProfile()}
      accessibilityRole="button"
      accessibilityLabel="Open profile and settings"
      hitSlop={8}
      style={styles.hit}
    >
      <Avatar.Text
        size={size}
        label={label}
        style={variant === 'onColor' ? styles.avatarOnColor : styles.avatarLight}
        labelStyle={[styles.avatarLabel, { fontSize: size * 0.42 }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: 'flex-start',
  },
  avatarOnColor: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  avatarLight: {
    backgroundColor: '#E8F5E9',
  },
  avatarLabel: {
    fontWeight: '700',
  },
});
