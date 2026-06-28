import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { IngredientThumb } from '../IngredientThumb';
import { CatalogIngredient, InventoryRow } from '../../types';
import { palette } from '../../theme';

export type IngredientPick = {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  inventory_item_id?: string;
};

type Props = {
  catalog: CatalogIngredient[];
  inventory: InventoryRow[];
  ingredientName: string;
  ingredientId?: string;
  inventoryItemId?: string;
  onSelect: (pick: IngredientPick) => void;
};

function linkInventory(inventory: InventoryRow[], name: string): InventoryRow | undefined {
  const norm = name.trim().toLowerCase();
  return inventory.find((row) => row.canonical_name.trim().toLowerCase() === norm);
}

function filterCatalog(catalog: CatalogIngredient[], query: string): CatalogIngredient[] {
  const q = query.trim().toLowerCase();
  const sorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted;
  return sorted.filter((item) => item.name.toLowerCase().includes(q));
}

export function IngredientCatalogPicker({
  catalog,
  inventory,
  ingredientName,
  ingredientId,
  inventoryItemId,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = useMemo(() => {
    if (ingredientId) {
      return catalog.find((c) => c.ingredient_id === ingredientId);
    }
    const norm = ingredientName.trim().toLowerCase();
    if (!norm) return undefined;
    return catalog.find((c) => c.name.trim().toLowerCase() === norm);
  }, [catalog, ingredientId, ingredientName]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.name ?? ingredientName ?? '');
    }
  }, [open, selected?.name, ingredientName]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const options = useMemo(() => filterCatalog(catalog, query), [catalog, query]);

  const pick = (item: CatalogIngredient) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    const stock = linkInventory(inventory, item.name);
    setQuery(item.name);
    setOpen(false);
    onSelect({
      ingredient_id: item.ingredient_id,
      ingredient_name: item.name,
      unit: item.default_unit,
      inventory_item_id: stock?.item_id,
    });
  };

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setQuery(selected?.name ?? ingredientName ?? '');
    }, 180);
  };

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <TextInput
        label="Ingredient"
        placeholder="Search ingredients…"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        mode="outlined"
        dense
        style={styles.input}
        textColor={palette.text}
        outlineColor={open ? palette.primary : palette.border}
        activeOutlineColor={palette.primary}
        right={<TextInput.Icon icon={open ? 'chevron-up' : 'chevron-down'} />}
      />
      {inventoryItemId && selected ? (
        <Text style={styles.linkedHint}>Linked to stock</Text>
      ) : selected && !linkInventory(inventory, selected.name) ? (
        <Text style={styles.missingStock}>Not in stock yet — add via Stock tab</Text>
      ) : null}
      {!selected && ingredientName.trim() ? (
        <Text style={styles.legacyHint}>Pick an ingredient from the catalog</Text>
      ) : null}

      {open ? (
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
                    <IngredientThumb
                      name={item.name}
                      ingredientId={item.ingredient_id}
                      size={32}
                      resizeMode="contain"
                    />
                    <View style={styles.optionText}>
                      <Text style={styles.optionName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.optionMeta}>{item.default_unit}</Text>
                    </View>
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
  wrap: { flex: 1, minWidth: 0, zIndex: 2 },
  wrapOpen: { zIndex: 20 },
  input: { backgroundColor: palette.surface },
  linkedHint: { color: palette.success, fontSize: 11, marginTop: 4, marginLeft: 4 },
  missingStock: { color: palette.textMuted, fontSize: 11, marginTop: 4, marginLeft: 4 },
  legacyHint: { color: palette.error, fontSize: 11, marginTop: 4, marginLeft: 4 },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
    overflow: 'hidden',
    maxHeight: 220,
  },
  list: { maxHeight: 220 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionActive: { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  optionText: { flex: 1, minWidth: 0 },
  optionName: { color: palette.text, fontWeight: '600' },
  optionMeta: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: palette.textMuted, fontSize: 12, padding: 12 },
});
