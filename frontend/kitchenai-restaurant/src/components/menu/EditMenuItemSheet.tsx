import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, TextInput } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { GroupDropdown, normalizeCategory } from './GroupDropdown';
import { IngredientCatalogPicker } from './IngredientCatalogPicker';
import { CatalogIngredient, InventoryRow, MenuItem, RecipeIngredient } from '../../types';
import { palette } from '../../theme';

export type IngredientDraft = {
  key: string;
  ingredient_id?: string;
  inventory_item_id?: string;
  ingredient_name: string;
  qty: string;
  unit: string;
};

type Props = {
  visible: boolean;
  item: MenuItem | null;
  ingredients: RecipeIngredient[];
  catalog: CatalogIngredient[];
  inventory: InventoryRow[];
  categoryOptions?: string[];
  saving: boolean;
  onDismiss: () => void;
  onSave: (payload: {
    name: string;
    category: string;
    ingredients: IngredientDraft[];
  }) => void;
};

function catalogMatch(catalog: CatalogIngredient[], ing: RecipeIngredient): CatalogIngredient | undefined {
  const catalogId = ing.catalog_ingredient_id?.trim();
  if (catalogId) {
    const byId = catalog.find((c) => c.ingredient_id === catalogId);
    if (byId) return byId;
  }
  const norm = ing.ingredient_name.trim().toLowerCase();
  if (!norm) return undefined;
  return catalog.find((c) => c.name.trim().toLowerCase() === norm);
}

function newDraft(partial?: Partial<IngredientDraft>): IngredientDraft {
  return {
    key: partial?.key ?? String(Date.now()) + Math.random(),
    ingredient_id: partial?.ingredient_id,
    inventory_item_id: partial?.inventory_item_id,
    ingredient_name: partial?.ingredient_name ?? '',
    qty: partial?.qty ?? '1',
    unit: partial?.unit ?? 'g',
  };
}

export function EditMenuItemSheet({
  visible,
  item,
  ingredients,
  catalog,
  inventory,
  categoryOptions = [],
  saving,
  onDismiss,
  onSave,
}: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [drafts, setDrafts] = useState<IngredientDraft[]>([newDraft()]);

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'general');
    if (ingredients.length > 0) {
      setDrafts(
        ingredients.map((ing, i) => {
          const hit = catalogMatch(catalog, ing);
          return newDraft({
            key: ing.recipe_ingredient_id ?? `ing-${i}`,
            ingredient_id: hit?.ingredient_id ?? ing.catalog_ingredient_id,
            inventory_item_id: ing.inventory_item_id,
            ingredient_name: hit?.name ?? ing.ingredient_name,
            qty: String(ing.qty),
            unit: ing.unit,
          });
        }),
      );
    } else {
      setDrafts([newDraft()]);
    }
  }, [visible, item, ingredients, catalog]);

  const updateDraft = (key: string, patch: Partial<IngredientDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const handleSave = () => {
    const valid = drafts.filter((d) => {
      const name = d.ingredient_name.trim();
      const qty = parseFloat(d.qty);
      return name.length > 0 && Number.isFinite(qty) && qty > 0;
    });
    onSave({
      name: name.trim(),
      category: category.trim() || 'general',
      ingredients: valid,
    });
  };

  const title = item ? 'Edit dish' : 'Add dish';
  const subtitle = item ? item.name : 'Pick stock ingredients for deduction';
  const groupOptions = useMemo(() => {
    const set = new Set<string>([...categoryOptions.map(normalizeCategory)]);
    if (item?.category) set.add(normalizeCategory(item.category));
    set.add(normalizeCategory(category));
    return [...set];
  }, [categoryOptions, item?.category, category]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title} subtitle={subtitle}>
      <View style={styles.row}>
        <TextInput
          label="Dish name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={[styles.input, styles.nameInput]}
          textColor={palette.text}
          outlineColor={palette.border}
        />
        <GroupDropdown value={category} options={groupOptions} onChange={setCategory} />
      </View>

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Ingredients
      </Text>
      {drafts.map((draft, index) => (
        <View key={draft.key} style={[styles.ingRow, index > 0 && styles.ingRowSpaced]}>
          <IngredientCatalogPicker
            catalog={catalog}
            inventory={inventory}
            ingredientName={draft.ingredient_name}
            ingredientId={draft.ingredient_id}
            inventoryItemId={draft.inventory_item_id}
            onSelect={(pick) =>
              updateDraft(draft.key, {
                ingredient_id: pick.ingredient_id,
                inventory_item_id: pick.inventory_item_id,
                ingredient_name: pick.ingredient_name,
                unit: pick.unit,
              })
            }
          />
          <TextInput
            label="Qty"
            value={draft.qty}
            onChangeText={(v) => updateDraft(draft.key, { qty: v })}
            keyboardType="decimal-pad"
            mode="outlined"
            style={[styles.input, styles.qtyInput]}
            textColor={palette.text}
            outlineColor={palette.border}
          />
          <IconButton
            icon="close"
            size={18}
            iconColor={palette.textMuted}
            onPress={() => removeDraft(draft.key)}
            style={styles.removeIng}
          />
        </View>
      ))}

      <Button
        mode="text"
        icon="plus"
        onPress={() => setDrafts((prev) => [...prev, newDraft()])}
        textColor={palette.primary}
        style={styles.addIngBtn}
      >
        Add ingredient
      </Button>

      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={!name.trim() || saving}
        buttonColor={palette.primary}
        textColor="#0F172A"
        style={styles.saveBtn}
      >
        Save dish
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 10, backgroundColor: palette.surface },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  nameInput: { flex: 2, marginBottom: 0 },
  sectionTitle: { color: palette.text, marginTop: 16, marginBottom: 8 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ingRowSpaced: { marginTop: 8 },
  qtyInput: { width: 72, marginBottom: 0, marginTop: 0 },
  removeIng: { margin: 0, marginTop: 4 },
  addIngBtn: { alignSelf: 'flex-start', marginBottom: 8 },
  saveBtn: { marginTop: 8, marginBottom: 8 },
});
