import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import { Entitlements } from '../../types';

type Props = {
  entitlements: Entitlements | null;
  planLabel: string;
  onPress: () => void;
};

export function ProfileHeaderUpgrade({ entitlements, planLabel, onPress }: Props) {
  const isElite = Boolean(entitlements?.is_elite);
  const isPro = Boolean(entitlements?.is_pro);

  if (isElite) {
    return (
      <View style={[styles.badge, styles.badgeElite]}>
        <Icon source="crown" size={16} color="#1B5E20" />
        <Text style={[styles.badgeText, styles.badgeTextElite]}>Elite</Text>
      </View>
    );
  }

  const label = isPro ? 'Go Elite' : 'Upgrade';
  const icon = isPro ? 'crown' : 'star';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.upgradeBtn, isPro && styles.upgradeBtnElite, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={isPro ? 'Upgrade to Elite' : 'Upgrade plan'}
    >
      <Icon source={icon} size={16} color={isPro ? '#1B5E20' : '#2E7D32'} />
      <View style={styles.upgradeTextWrap}>
        <Text style={[styles.upgradeLabel, isPro && styles.upgradeLabelElite]}>{label}</Text>
        {!isPro ? (
          <Text style={styles.upgradeSub} numberOfLines={1}>
            {planLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: 130,
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeBtnElite: {
    backgroundColor: '#E8F5E9',
  },
  pressed: { opacity: 0.88 },
  upgradeTextWrap: { flexShrink: 1 },
  upgradeLabel: { fontSize: 14, fontWeight: '800', color: '#2E7D32' },
  upgradeLabelElite: { color: '#1B5E20' },
  upgradeSub: { fontSize: 10, color: '#666666', marginTop: 1, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeElite: { backgroundColor: 'rgba(255,255,255,0.92)' },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  badgeTextElite: { color: '#1B5E20' },
});
