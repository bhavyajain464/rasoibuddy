import React, { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Icon, Text } from 'react-native-paper';
import { palette } from '../theme';

const COMPACT_HEIGHT = 40;

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDisplay(value: string): string {
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  compact?: boolean;
  fullWidth?: boolean;
  allowPastDates?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

function BorderFieldLabel({ label }: { label: string }) {
  return (
    <View style={styles.borderLabelWrap} pointerEvents="none">
      <Text variant="labelSmall" style={styles.borderLabel}>
        {label}
      </Text>
    </View>
  );
}

export function ExpiryDateBox({
  value,
  onChange,
  label = 'Expiry (optional)',
  compact = false,
  fullWidth = false,
  allowPastDates = false,
  style,
  accessibilityLabel = 'Set date',
}: Props) {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  const minimumDate = allowPastDates ? undefined : new Date();

  const openPicker = () => {
    const current = parseISODate(value);

    if (Platform.OS === 'web') {
      webInputRef.current?.showPicker?.();
      webInputRef.current?.click();
      return;
    }

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        ...(minimumDate ? { minimumDate } : {}),
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            onChange(toISODate(date));
          }
        },
      });
      return;
    }

    setIosPickerOpen(true);
  };

  const handleIOSChange = (_event: unknown, date?: Date) => {
    setIosPickerOpen(false);
    if (date) {
      onChange(toISODate(date));
    }
  };

  return (
    <View style={[styles.root, compact && styles.rootCompact, style]}>
      <View style={[
        styles.box,
        compact && styles.boxCompact,
        fullWidth && styles.boxFullWidth,
      ]}>
        <BorderFieldLabel label={label} />
        <Pressable
          onPress={openPicker}
          style={styles.touch}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Text
            variant="bodySmall"
            style={[styles.dateText, !value && styles.datePlaceholder]}
            numberOfLines={1}
          >
            {value ? formatDisplay(value) : ''}
          </Text>
          <Icon source="calendar" size={compact ? 16 : 18} color={palette.primary} />
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <input
          ref={webInputRef}
          type="date"
          value={value}
          {...(minimumDate ? { min: toISODate(minimumDate) } : {})}
          onChange={(event) => onChange(event.target.value)}
          style={styles.webInput as object}
          aria-hidden
          tabIndex={-1}
        />
      ) : null}

      {Platform.OS === 'ios' && iosPickerOpen ? (
        <DateTimePicker
          value={parseISODate(value)}
          mode="date"
          display="default"
          {...(minimumDate ? { minimumDate } : {})}
          onChange={handleIOSChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 12,
    paddingTop: 6,
  },
  rootCompact: {
    marginBottom: 0,
    paddingTop: 6,
  },
  box: {
    width: 88,
    height: COMPACT_HEIGHT,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: '#fff',
    overflow: 'visible',
    justifyContent: 'center',
  },
  boxCompact: {
    width: 134,
  },
  boxFullWidth: {
    width: '100%',
    height: 48,
  },
  borderLabelWrap: {
    position: 'absolute',
    top: -9,
    left: 8,
    zIndex: 1,
  },
  borderLabel: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#fff',
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  touch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 4,
  },
  dateText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontWeight: '600',
    color: palette.text,
    fontSize: 12,
  },
  datePlaceholder: {
    color: palette.textMuted,
  },
  webInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    pointerEvents: 'none',
  },
});
