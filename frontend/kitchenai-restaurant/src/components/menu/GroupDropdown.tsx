import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { palette } from '../../theme';

export const DEFAULT_MENU_GROUPS = [
  'general',
  'starters',
  'mains',
  'breads',
  'rice',
  'desserts',
  'beverages',
];

export function formatCategoryLabel(category: string): string {
  const raw = category.trim() || 'general';
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase() || 'general';
}

type Props = {
  value: string;
  options: string[];
  onChange: (category: string) => void;
};

export function GroupDropdown({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const normalized = normalizeCategory(value);
  const choices = useMemo(() => {
    const set = new Set<string>([...DEFAULT_MENU_GROUPS, ...options.map(normalizeCategory), normalized]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [options, normalized]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setCustomMode(false);
      setCustomValue('');
    }
  }, [open]);

  const select = (category: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(category);
    setOpen(false);
    setCustomMode(false);
    setCustomValue('');
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 180);
  };

  const saveCustom = () => {
    const next = normalizeCategory(customValue);
    if (!next) return;
    select(next);
  };

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        onPress={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen((v) => !v);
        }}
        style={[styles.field, open && styles.fieldOpen]}
      >
        <Text style={styles.fieldLabel}>Group</Text>
        <Text style={styles.fieldValue} numberOfLines={1}>
          {formatCategoryLabel(normalized)}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {choices.map((cat) => {
              const active = normalized === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => select(cat)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text style={styles.optionName}>{formatCategoryLabel(cat)}</Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCustomMode(true)}
              style={[styles.option, styles.customOption, customMode && styles.optionActive]}
            >
              <Text style={styles.optionName}>Other group…</Text>
            </Pressable>
          </ScrollView>
          {customMode ? (
            <View style={styles.customRow}>
              <TextInput
                label="New group"
                value={customValue}
                onChangeText={setCustomValue}
                onBlur={handleBlur}
                mode="outlined"
                dense
                autoFocus
                style={styles.customInput}
                textColor={palette.text}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
                onSubmitEditing={saveCustom}
              />
              <Pressable onPress={saveCustom} style={styles.customSave}>
                <Text style={styles.customSaveText}>Add</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, zIndex: 2 },
  wrapOpen: { zIndex: 20 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 4,
    backgroundColor: palette.surface,
    paddingLeft: 12,
    paddingRight: 8,
    paddingTop: 18,
    paddingBottom: 8,
    minHeight: 56,
    position: 'relative',
  },
  fieldOpen: { borderColor: palette.primary, borderWidth: 2 },
  fieldLabel: {
    position: 'absolute',
    top: 6,
    left: 12,
    fontSize: 12,
    color: palette.textMuted,
    backgroundColor: palette.surface,
    paddingHorizontal: 2,
  },
  fieldValue: { color: palette.text, flex: 1, fontWeight: '600', marginTop: 4 },
  chevron: { color: palette.textMuted, fontSize: 11, marginLeft: 8 },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
    overflow: 'hidden',
    maxHeight: 280,
  },
  list: { maxHeight: 220 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionActive: { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  customOption: { borderBottomWidth: 0 },
  optionName: { color: palette.text, fontWeight: '600' },
  check: { color: palette.primary, fontWeight: '700' },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  customInput: { flex: 1, backgroundColor: palette.surface },
  customSave: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: palette.primary,
  },
  customSaveText: { color: '#0F172A', fontWeight: '700' },
});
