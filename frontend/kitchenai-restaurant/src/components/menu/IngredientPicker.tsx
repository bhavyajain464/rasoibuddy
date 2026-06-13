import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { InventoryRow } from '../../types';
import { palette } from '../../theme';

type Props = {
  inventory: InventoryRow[];
  ingredientName: string;
  inventoryItemId?: string;
  onSelect: (pick: { inventory_item_id: string; ingredient_name: string; unit: string }) => void;
};

function rankMatches(items: InventoryRow[], query: string): InventoryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...items].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)).slice(0, 3);
  }
  return items
    .map((item) => {
      const name = item.canonical_name.toLowerCase();
      let score = 0;
      if (name === q) score = 4;
      else if (name.startsWith(q)) score = 3;
      else if (name.includes(q)) score = 2;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.item.canonical_name.localeCompare(b.item.canonical_name),
    )
    .slice(0, 3)
    .map((x) => x.item);
}

export function IngredientPicker({ inventory, ingredientName, inventoryItemId, onSelect }: Props) {
  const [query, setQuery] = useState(ingredientName);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setQuery(ingredientName);
  }, [ingredientName]);

  const options = useMemo(() => rankMatches(inventory, query), [inventory, query]);

  const showDropdown = focused && options.length > 0;

  const pick = (item: InventoryRow) => {
    onSelect({
      inventory_item_id: item.item_id,
      ingredient_name: item.canonical_name,
      unit: item.unit,
    });
    setQuery(item.canonical_name);
    setFocused(false);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        label="Ingredient"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setTimeout(() => setFocused(false), 150);
        }}
        mode="outlined"
        style={styles.input}
        textColor={palette.text}
        outlineColor={palette.border}
        placeholder="Search stock items…"
      />
      {inventoryItemId && !focused && query ? (
        <Text style={styles.linkedHint}>Linked to stock</Text>
      ) : null}
      {showDropdown ? (
        <View style={styles.dropdown}>
          {options.map((item) => (
            <Pressable
              key={item.item_id}
              onPress={() => pick(item)}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionName} numberOfLines={1}>
                {item.canonical_name}
              </Text>
              <Text style={styles.optionMeta}>
                {item.qty} {item.unit}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : focused && query.trim() && options.length === 0 ? (
        <Text style={styles.empty}>No stock items match</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, position: 'relative', zIndex: 1 },
  input: { backgroundColor: palette.surface, marginBottom: 0 },
  linkedHint: { color: palette.success, fontSize: 11, marginTop: 4, marginLeft: 4 },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionPressed: { opacity: 0.85 },
  optionName: { color: palette.text, flex: 1, paddingRight: 8, fontWeight: '600' },
  optionMeta: { color: palette.textMuted, fontSize: 12 },
  empty: { color: palette.textMuted, fontSize: 12, marginTop: 6, marginLeft: 4 },
});
