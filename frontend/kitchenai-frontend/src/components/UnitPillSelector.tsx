import React from 'react';
import {
  Pressable,
  ScrollView,
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
/** Min width per unit pill so "pcs" / "ml" never truncate. */
const COMPACT_SEGMENT_MIN_WIDTH = 34;
/** Intrinsic width for inline rows (all unit pills, no extra empty space). */
export const COMPACT_UNIT_STRIP_WIDTH =
  UNIT_OPTIONS.length * COMPACT_SEGMENT_MIN_WIDTH + (UNIT_OPTIONS.length - 1) + 12;

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
  /** Parent row supplies label gutter (paddingTop); use in multi-field rows. */
  embedded?: boolean;
};

export function QuantityBox({
  label = 'Quantity',
  value,
  onChangeText,
  style,
  compact = false,
  embedded = false,
}: QuantityBoxProps) {
  return (
    <View
      style={[
        styles.fieldRoot,
        compact && styles.fieldRootCompact,
        embedded && styles.fieldRootEmbedded,
        style,
      ]}
    >
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
          placeholderTextColor={palette.textMuted}
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
  /** Let the pill row grow to fill remaining horizontal space (e.g. stacked inventory row). */
  fillWidth?: boolean;
  /** Parent row supplies label gutter (paddingTop); use in multi-field rows. */
  embedded?: boolean;
  /** Fixed width from pill count — for single-line rows; do not stretch. */
  hugContent?: boolean;
};

export function UnitPillSelector({
  value,
  onChange,
  label = 'Unit',
  disabled = false,
  style,
  compact = false,
  fillWidth = false,
  embedded = false,
  hugContent = false,
}: UnitPillSelectorProps) {
  const selected = value.trim() || DEFAULT_UNIT;

  const segmentLayoutStyle = !compact
    ? styles.segmentFlex
    : hugContent
      ? styles.segmentCompact
      : fillWidth
        ? styles.segmentDistributed
        : styles.segmentCompact;

  const segments = UNIT_OPTIONS.map((unit) => {
    const active = selected === unit;
    return (
      <Pressable
        key={unit}
        onPress={() => onChange(unit)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.segment,
          segmentLayoutStyle,
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
        >
          {unit}
        </Text>
      </Pressable>
    );
  });

  const capsuleBody = (
    <View
      style={[
        styles.capsule,
        compact && styles.capsuleCompact,
        fillWidth && styles.capsuleFill,
        hugContent && styles.capsuleCompactRow,
      ]}
    >
      {segments}
    </View>
  );

  /** Scroll only for fixed-width compact; fillWidth distributes pills across the row. */
  const useCompactScroll = compact && !hugContent && !fillWidth;

  return (
    <View
      style={[
        styles.unitRoot,
        compact && !fillWidth && !hugContent && styles.unitRootCompact,
        fillWidth && styles.unitRootFill,
        hugContent && styles.unitRootHug,
        embedded && styles.unitRootEmbedded,
        style,
      ]}
    >
      <View
        style={[
          styles.unitBox,
          compact && styles.unitBoxCompact,
          fillWidth && styles.unitBoxFill,
          hugContent && styles.unitBoxHug,
        ]}
      >
        <BorderFieldLabel label={label} align="left" />
        {useCompactScroll ? (
          <View style={styles.capsuleViewport}>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.capsuleScroll}
              contentContainerStyle={styles.capsuleScrollContent}
            >
              {capsuleBody}
            </ScrollView>
          </View>
        ) : fillWidth && compact ? (
          <View style={styles.capsuleViewportFill}>{capsuleBody}</View>
        ) : (
          capsuleBody
        )}
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
  fieldRootEmbedded: {
    paddingTop: 0,
  },
  borderLabelWrap: {
    position: 'absolute',
    top: -9,
    zIndex: 4,
    elevation: 4,
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
    borderColor: palette.border,
    backgroundColor: '#fff',
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
    color: palette.text,
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
  unitRootFill: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    marginBottom: 0,
    paddingTop: 6,
  },
  unitRootEmbedded: {
    paddingTop: 0,
  },
  unitRootHug: {
    flexGrow: 0,
    flexShrink: 0,
    width: COMPACT_UNIT_STRIP_WIDTH,
    maxWidth: COMPACT_UNIT_STRIP_WIDTH,
    marginBottom: 0,
    paddingTop: 0,
  },
  unitBoxHug: {
    width: '100%',
  },
  unitBoxFill: {
    width: '100%',
  },
  capsuleFill: {
    width: '100%',
    alignSelf: 'stretch',
  },
  capsuleViewportFill: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    justifyContent: 'center',
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
    height: COMPACT_HEIGHT,
    borderRadius: 10,
    padding: 2,
    paddingTop: 4,
    justifyContent: 'center',
    overflow: 'visible',
  },
  capsuleViewport: {
    flex: 1,
    minHeight: COMPACT_HEIGHT - 8,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
  },
  capsuleScroll: {
    flexGrow: 1,
    minWidth: 0,
  },
  capsuleScrollContent: {
    alignItems: 'center',
  },
  capsuleCompactRow: {
    flexGrow: 0,
    flexShrink: 0,
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
    height: COMPACT_HEIGHT - 4,
    padding: 2,
    gap: 1,
  },
  segment: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  segmentFlex: {
    flex: 1,
    minWidth: 0,
  },
  segmentCompact: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: COMPACT_SEGMENT_MIN_WIDTH,
    paddingHorizontal: 5,
  },
  segmentDistributed: {
    flex: 1,
    minWidth: 28,
    flexShrink: 1,
    paddingHorizontal: 4,
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
    fontSize: 11,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
