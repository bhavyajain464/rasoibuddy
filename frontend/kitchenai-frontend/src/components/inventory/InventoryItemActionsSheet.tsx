import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { palette } from '../../theme';

export type InventoryMenuAction = {
  key: string;
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  actions: InventoryMenuAction[];
  onDismiss: () => void;
};

export function InventoryItemActionsSheet({ visible, title, actions, onDismiss }: Props) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      subtitle="Choose an action"
      scrollable={false}
      maxHeightRatio={0.5}
    >
      <View style={styles.list}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={() => {
              onDismiss();
              action.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Icon
              source={action.icon}
              size={22}
              color={action.destructive ? palette.error : palette.primary}
            />
            <Text
              variant="bodyLarge"
              style={[styles.label, action.destructive && styles.labelDestructive]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 4,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: palette.primaryContainerLight,
  },
  label: {
    fontWeight: '600',
    color: palette.text,
  },
  labelDestructive: {
    color: palette.error,
  },
});
