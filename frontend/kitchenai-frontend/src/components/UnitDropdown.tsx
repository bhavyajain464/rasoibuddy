import React, { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Button, Menu, Text } from 'react-native-paper';

export const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'ml'] as const;

export const DEFAULT_UNIT = 'pcs';

type UnitDropdownProps = {
  value: string;
  onChange: (unit: string) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: ViewStyle;
};

export function UnitDropdown({
  value,
  onChange,
  label,
  disabled = false,
  compact = false,
  style,
}: UnitDropdownProps) {
  const [open, setOpen] = useState(false);
  const display = value.trim() || DEFAULT_UNIT;

  return (
    <View style={style}>
      {label ? (
        <Text variant="labelSmall" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setOpen(true)}
            disabled={disabled}
            icon="chevron-down"
            compact={compact}
            style={[styles.button, compact && styles.buttonCompact]}
            contentStyle={compact ? styles.buttonContentCompact : undefined}
            labelStyle={compact ? styles.buttonLabelCompact : undefined}
          >
            {display}
          </Button>
        }
      >
        {UNIT_OPTIONS.map((unit) => (
          <Menu.Item
            key={unit}
            title={unit}
            leadingIcon={display === unit ? 'check' : undefined}
            onPress={() => {
              onChange(unit);
              setOpen(false);
            }}
          />
        ))}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#666', marginBottom: 4 },
  button: { borderColor: '#E0E0E0', minWidth: 72 },
  buttonCompact: { minWidth: 64, height: 40 },
  buttonContentCompact: { height: 40 },
  buttonLabelCompact: { fontSize: 12, marginVertical: 0 },
});
