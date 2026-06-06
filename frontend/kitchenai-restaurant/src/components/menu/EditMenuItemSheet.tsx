import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, TextInput } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { FilterPill, FilterPillRow } from '../FilterPill';
import { IngredientPicker } from './IngredientPicker';
import { InventoryRow, MenuItem, RecipeIngredient } from '../../types';
import { palette } from '../../theme';

export type IngredientDraft = {
  key: string;
  inventory_item_id?: string;
  ingredient_name: string;
  qty: string;
  unit: string;
};

type Props = {
  visible: boolean;
  item: MenuItem | null;
  ingredients: RecipeIngredient[];
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

function newDraft(partial?: Partial<IngredientDraft>): IngredientDraft {
  return {
    key: partial?.key ?? String(Date.now()) + Math.random(),
    inventory_item_id: partial?.inventory_item_id,
    ingredient_name: partial?.ingredient_name ?? '',
    qty: partial?.qty ?? '1',
    unit: partial?.unit ?? 'g',
  };
}

function formatCategoryLabel(category: string): string {
  const raw = category.trim() || 'general';
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase() || 'general';
}

export function EditMenuItemSheet({
  visible,
  item,
  ingredients,
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
        ingredients.map((ing, i) =>
          newDraft({
            key: ing.ingredient_id ?? `ing-${i}`,
            inventory_item_id: ing.inventory_item_id,
            ingredient_name: ing.ingredient_name,
            qty: String(ing.qty),
            unit: ing.unit,
          }),
        ),
      );
    } else {
      setDrafts([newDraft()]);
    }
  }, [visible, item, ingredients]);

  const updateDraft = (key: string, patch: Partial<IngredientDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const handleSave = () => {
    onSave({
      name: name.trim(),
      category: category.trim() || 'general',
      ingredients: drafts.filter((d) => d.ingredient_name.trim()),
    });
  };

  const title = item ? 'Edit dish' : 'Add dish';
  const subtitle = item ? item.name : 'Pick stock ingredients for deduction';
  const groupChoices = useMemo(() => {
    const set = new Set<string>(['general', ...categoryOptions.map(normalizeCategory)]);
    if (item?.category) set.add(normalizeCategory(item.category));
    set.add(normalizeCategory(category));
    return [...set].sort((a, b) => a.localeCompare(b));
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
        <TextInput
          label="Group"
          value={category}
          onChangeText={setCategory}
          mode="outlined"
          style={[styles.input, styles.categoryInput]}
          textColor={palette.text}
          outlineColor={palette.border}
          placeholder="general"
        />
      </View>

      {groupChoices.length > 0 ? (
        <>
          <Text variant="labelMedium" style={styles.groupLabel}>
            Quick group
          </Text>
          <FilterPillRow inset={20} style={styles.groupPills}>
            {groupChoices.map((cat) => (
              <FilterPill
                key={cat}
                label={formatCategoryLabel(cat)}
                selected={normalizeCategory(category) === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </FilterPillRow>
        </>
      ) : null}

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Ingredients
      </Text>
      {drafts.map((draft, index) => (
        <View key={draft.key} style={[styles.ingRow, index > 0 && styles.ingRowSpaced]}>
          <IngredientPicker
            inventory={inventory}
            ingredientName={draft.ingredient_name}
            inventoryItemId={draft.inventory_item_id}
            onSelect={(pick) =>
              updateDraft(draft.key, {
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
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nameInput: { flex: 2, marginBottom: 0 },
  categoryInput: { flex: 1, marginBottom: 0 },
  groupLabel: { color: palette.textMuted, marginTop: 12, marginBottom: 4 },
  groupPills: { marginHorizontal: -20, marginBottom: 4 },
  sectionTitle: { color: palette.text, marginTop: 16, marginBottom: 8 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ingRowSpaced: { marginTop: 8 },
  qtyInput: { width: 72, marginBottom: 0, marginTop: 0 },
  removeIng: { margin: 0, marginTop: 4 },
  addIngBtn: { alignSelf: 'flex-start', marginBottom: 8 },
  saveBtn: { marginTop: 8, marginBottom: 8 },
});
