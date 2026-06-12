import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { CatalogIngredient } from '../types';
import { normalizeUnit } from '../utils/units';
import { palette } from '../theme';

const COMPACT_HEIGHT = 40;
const MAX_OPTIONS = 24;

export type IngredientPick = {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  food_group?: string;
};

type Props = {
  catalog: CatalogIngredient[];
  value: string;
  ingredientId?: string;
  onChangeText: (text: string) => void;
  onSelect: (pick: IngredientPick) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  style?: ViewStyle;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function filterCatalog(catalog: CatalogIngredient[], query: string): CatalogIngredient[] {
  const q = norm(query);
  if (!q) return catalog.slice(0, MAX_OPTIONS);
  const matches: CatalogIngredient[] = [];
  for (const item of catalog) {
    if (matches.length >= MAX_OPTIONS) break;
    const name = norm(item.name);
    const id = norm(item.ingredient_id);
    if (name.includes(q) || id.includes(q)) {
      matches.push(item);
      continue;
    }
    if (item.synonyms?.some((syn) => norm(syn).includes(q))) {
      matches.push(item);
    }
  }
  return matches;
}

function BorderFieldLabel({ label }: { label: string }) {
  return (
    <View style={styles.borderLabelWrap} pointerEvents="none">
      <Text variant="labelSmall" style={styles.borderLabel}>
        {label}
      </Text>
    </View>
  );
}

export function IngredientNamePicker({
  catalog,
  value,
  ingredientId,
  onChangeText,
  onSelect,
  label = 'Name',
  placeholder = 'Search ingredients…',
  compact = false,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = useMemo(() => {
    if (ingredientId) {
      return catalog.find((c) => c.ingredient_id === ingredientId);
    }
    const n = norm(value);
    if (!n) return undefined;
    return catalog.find((c) => norm(c.name) === n);
  }, [catalog, ingredientId, value]);

  useEffect(() => {
    if (!open) setQuery(selected?.name ?? value ?? '');
  }, [open, selected?.name, value]);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const options = useMemo(() => filterCatalog(catalog, query), [catalog, query]);

  const pick = (item: CatalogIngredient) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    const unit = normalizeUnit(item.default_unit);
    setQuery(item.name);
    onChangeText(item.name);
    setOpen(false);
    onSelect({
      ingredient_id: item.ingredient_id,
      ingredient_name: item.name,
      unit,
      food_group: item.food_group,
    });
  };

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setQuery(selected?.name ?? value ?? '');
    }, 180);
  };

  return (
    <View style={[styles.fieldRoot, compact && styles.fieldRootCompact, open && styles.fieldRootOpen, style]}>
      <View style={[styles.nameBox, compact && styles.nameBoxCompact, open && styles.nameBoxOpen]}>
        <BorderFieldLabel label={label} />
        <RNTextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            onChangeText(text);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.nameInput, compact && styles.nameInputCompact]}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <View style={styles.chevron} pointerEvents="none">
          <Icon source={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
        </View>
      </View>

      {open && catalog.length > 0 ? (
        <View style={styles.dropdown}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {options.length === 0 ? (
              <Text style={styles.empty}>No ingredients match</Text>
            ) : (
              options.map((item) => {
                const active = selected?.ingredient_id === item.ingredient_id;
                return (
                  <Pressable
                    key={item.ingredient_id}
                    onPress={() => pick(item)}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={styles.optionName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.optionMeta}>{normalizeUnit(item.default_unit)}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldRoot: {
    marginBottom: 12,
    paddingTop: 6,
    zIndex: 1,
  },
  fieldRootCompact: {
    marginBottom: 0,
    paddingTop: 6,
  },
  fieldRootOpen: {
    zIndex: 30,
  },
  borderLabelWrap: {
    position: 'absolute',
    top: -9,
    left: 8,
    zIndex: 4,
    elevation: 4,
  },
  borderLabel: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#fff',
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  nameBox: {
    width: '100%',
    height: 48,
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
  nameBoxOpen: {
    borderColor: palette.primary,
  },
  nameInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
    paddingHorizontal: 12,
    paddingRight: 34,
    paddingVertical: 0,
  },
  nameInputCompact: {
    fontSize: 14,
    paddingHorizontal: 10,
    paddingRight: 30,
  },
  chevron: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#fff',
    overflow: 'hidden',
    maxHeight: 220,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  list: { maxHeight: 220 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  optionActive: { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  optionName: { color: palette.text, flex: 1, paddingRight: 8, fontWeight: '600', fontSize: 14 },
  optionMeta: { color: palette.textMuted, fontSize: 12 },
  empty: { color: palette.textMuted, fontSize: 12, padding: 12 },
});
