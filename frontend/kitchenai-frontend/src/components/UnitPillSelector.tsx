import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Text } from 'react-native-paper';
import { DEFAULT_UNIT, UNIT_OPTIONS } from './UnitDropdown';
import { palette } from '../theme';

export { DEFAULT_UNIT, UNIT_OPTIONS };

const CONTROL_HEIGHT = 48;
const COMPACT_HEIGHT = 40;

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

function BorderFieldLabel({
  label,
  align = 'center',
}: {
  label: string;
  align?: 'center' | 'right' | 'left';
}) {
  const wrapStyle =
    align === 'left'
      ? styles.borderLabelWrapLeft
      : align === 'right'
        ? styles.borderLabelWrapRight
        : styles.borderLabelWrapCenter;

  return (
    <View style={[styles.borderLabelWrap, wrapStyle]} pointerEvents="none">
      <Text variant="labelSmall" style={styles.borderLabel}>
        {label}
      </Text>
    </View>
  );
}

type QuantityBoxProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  style?: ViewStyle;
  compact?: boolean;
};

export function QuantityBox({
  label = 'Quantity',
  value,
  onChangeText,
  style,
  compact = false,
}: QuantityBoxProps) {
  return (
    <View style={[styles.fieldRoot, compact && styles.fieldRootCompact, style]}>
      <View style={[styles.qtyBox, compact && styles.qtyBoxCompact]}>
        <BorderFieldLabel label={label} align="left" />
        <RNTextInput
          value={value}
          onChangeText={(text) => onChangeText(sanitizeDecimalInput(text))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={[styles.qtyInput, compact && styles.qtyInputCompact]}
          textAlign="center"
          placeholder="0"
          placeholderTextColor={palette.primarySoft}
          returnKeyType="done"
          maxLength={8}
        />
      </View>
    </View>
  );
}

type ItemNameBoxProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
  compact?: boolean;
  keyboardType?: React.ComponentProps<typeof RNTextInput>['keyboardType'];
  autoCapitalize?: React.ComponentProps<typeof RNTextInput>['autoCapitalize'];
};

export function ItemNameBox({
  label = 'Item name',
  value,
  onChangeText,
  placeholder = 'Item name',
  style,
  compact = false,
  keyboardType,
  autoCapitalize = 'words',
}: ItemNameBoxProps) {
  return (
    <View style={[styles.fieldRoot, compact && styles.fieldRootCompact, style]}>
      <View style={[styles.nameBox, compact && styles.nameBoxCompact]}>
        <BorderFieldLabel label={label} align="left" />
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          style={[styles.nameInput, compact && styles.nameInputCompact]}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          autoCapitalize={autoCapitalize}
          returnKeyType="next"
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

type UnitPillSelectorProps = {
  value: string;
  onChange: (unit: string) => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
  compact?: boolean;
};

export function UnitPillSelector({
  value,
  onChange,
  label = 'Unit',
  disabled = false,
  style,
  compact = false,
}: UnitPillSelectorProps) {
  const selected = value.trim() || DEFAULT_UNIT;

  return (
    <View style={[styles.unitRoot, compact && styles.unitRootCompact, style]}>
      <View style={[styles.unitBox, compact && styles.unitBoxCompact]}>
        <BorderFieldLabel label={label} align="left" />
        <View style={[styles.capsule, compact && styles.capsuleCompact]}>
          {UNIT_OPTIONS.map((unit) => {
            const active = selected === unit;
            return (
              <Pressable
                key={unit}
                onPress={() => onChange(unit)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.segment,
                  active && styles.segmentActive,
                  pressed && !active && styles.segmentPressed,
                  disabled && styles.segmentDisabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    compact && styles.segmentTextCompact,
                    active && styles.segmentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {unit}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldRoot: {
    marginBottom: 12,
    paddingTop: 6,
  },
  fieldRootCompact: {
    marginBottom: 0,
    paddingTop: 6,
  },
  borderLabelWrap: {
    position: 'absolute',
    top: -9,
    zIndex: 1,
  },
  borderLabelWrapCenter: {
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  borderLabelWrapRight: {
    right: 8,
  },
  borderLabelWrapLeft: {
    left: 8,
  },
  borderLabel: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#fff',
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  qtyBox: {
    width: 72,
    height: CONTROL_HEIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.primary,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  qtyBoxCompact: {
    width: 56,
    height: COMPACT_HEIGHT,
    borderRadius: 10,
  },
  qtyInput: {
    width: '100%',
    height: '100%',
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryDark,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  qtyInputCompact: {
    fontSize: 14,
    paddingHorizontal: 4,
  },
  nameBox: {
    width: '100%',
    height: CONTROL_HEIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: '#fff',
    justifyContent: 'center',
    overflow: 'visible',
  },
  nameBoxCompact: {
    height: COMPACT_HEIGHT,
    borderRadius: 10,
  },
  nameInput: {
    width: '100%',
    height: '100%',
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  nameInputCompact: {
    fontSize: 14,
    paddingHorizontal: 10,
  },
  unitRoot: {
    flex: 1,
    minWidth: 0,
    marginBottom: 12,
    paddingTop: 6,
  },
  unitRootCompact: {
    marginBottom: 0,
    paddingTop: 6,
    minWidth: 108,
    maxWidth: 132,
  },
  unitBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: '#fff',
    padding: 4,
    overflow: 'visible',
  },
  unitBoxCompact: {
    borderRadius: 10,
    padding: 3,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CONTROL_HEIGHT - 8,
    borderRadius: 999,
    backgroundColor: '#EEEEEE',
    padding: 4,
    gap: 2,
  },
  capsuleCompact: {
    height: COMPACT_HEIGHT - 6,
    padding: 3,
    gap: 1,
  },
  segment: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 2,
  },
  segmentActive: {
    backgroundColor: palette.primary,
    shadowColor: palette.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  segmentDisabled: {
    opacity: 0.5,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  segmentTextCompact: {
    fontSize: 10,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
