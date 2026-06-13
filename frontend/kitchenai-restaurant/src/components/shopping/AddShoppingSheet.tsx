import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { IngredientCatalogPicker, IngredientPick } from '../menu/IngredientCatalogPicker';
import { CatalogIngredient } from '../../types';
import { palette } from '../../theme';

type Props = {
  visible: boolean;
  saving: boolean;
  catalog: CatalogIngredient[];
  onDismiss: () => void;
  onSave: (payload: { name: string; qty: number; unit: string }) => void;
};

export function AddShoppingSheet({ visible, saving, catalog, onDismiss, onSave }: Props) {
  const [pick, setPick] = useState<IngredientPick | null>(null);
  const [qty, setQty] = useState('1');

  useEffect(() => {
    if (!visible) return;
    setPick(null);
    setQty('1');
  }, [visible]);

  const handleSave = () => {
    if (!pick) return;
    onSave({
      name: pick.ingredient_name,
      qty: parseFloat(qty) || 1,
      unit: pick.unit,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Add to buy list"
      subtitle="Pick from the ingredient catalog"
    >
      <IngredientCatalogPicker
        catalog={catalog}
        inventory={[]}
        ingredientName={pick?.ingredient_name ?? ''}
        ingredientId={pick?.ingredient_id}
        onSelect={setPick}
      />
      <View style={styles.row}>
        <TextInput
          label="Qty"
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          mode="outlined"
          style={[styles.input, styles.qtyInput]}
          textColor={palette.text}
          outlineColor={palette.border}
        />
        <TextInput
          label="Unit"
          value={pick?.unit ?? ''}
          mode="outlined"
          style={[styles.input, styles.unitInput]}
          textColor={palette.textMuted}
          outlineColor={palette.border}
          disabled
        />
      </View>
      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={!pick || saving}
        buttonColor={palette.primary}
        textColor="#0F172A"
        style={styles.saveBtn}
      >
        Add item
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: palette.surface, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8, marginTop: 8 },
  qtyInput: { flex: 1 },
  unitInput: { flex: 1 },
  saveBtn: { marginTop: 8 },
});
