import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { palette } from '../../theme';

type Props = {
  visible: boolean;
  saving: boolean;
  onDismiss: () => void;
  onSave: (payload: { name: string; qty: number; unit: string }) => void;
};

export function AddShoppingSheet({ visible, saving, onDismiss, onSave }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('kg');

  useEffect(() => {
    if (!visible) return;
    setName('');
    setQty('1');
    setUnit('kg');
  }, [visible]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      qty: parseFloat(qty) || 1,
      unit: unit.trim() || 'pcs',
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Add to buy list"
      subtitle="Vendor procurement for this kitchen"
    >
      <TextInput
        label="Item name"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
        textColor={palette.text}
        autoFocus
      />
      <View style={styles.row}>
        <TextInput
          label="Qty"
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          mode="outlined"
          style={[styles.input, styles.inputShort]}
          textColor={palette.text}
        />
        <TextInput
          label="Unit"
          value={unit}
          onChangeText={setUnit}
          mode="outlined"
          style={[styles.input, styles.inputShort]}
          textColor={palette.text}
        />
      </View>
      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={!name.trim() || saving}
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
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  inputShort: { flex: 1 },
  saveBtn: { marginTop: 8 },
});
