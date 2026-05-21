import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Surface,
  Button,
  IconButton,
  Chip,
  Portal,
  Modal,
  Divider,
  TextInput,
  Switch,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import * as api from '../../services/api';
import { CookedLogEntry, DietAnalysisSettings } from '../../types';
import { useEntitlements } from '../../context/EntitlementsContext';
import { usePlanUpgrade } from '../../hooks/usePlanUpgrade';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Logged',
  'whatsapp-parsed': 'WhatsApp',
  'cook-reported': 'From cook',
};

const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
] as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MealsHistoryDietTab() {
  const { entitlements } = useEntitlements();
  const { subscribe, busy: upgradeBusy } = usePlanUpgrade();
  const [mealHistory, setMealHistory] = useState<CookedLogEntry[]>([]);
  const [dietSettings, setDietSettings] = useState<DietAnalysisSettings | null>(null);
  const [dietLoading, setDietLoading] = useState(true);
  const [dietSaving, setDietSaving] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addDishName, setAddDishName] = useState('');
  const [addMealSlot, setAddMealSlot] = useState('');
  const [addCookedOn, setAddCookedOn] = useState(todayISO);
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await api.getCookedHistory();
      setMealHistory(res.entries || []);
    } catch {
      setMealHistory([]);
    }
  }, []);

  const refreshDiet = useCallback(async () => {
    setDietLoading(true);
    try {
      const s = await api.getDietAnalysisSettings();
      setDietSettings(s);
    } catch {
      setDietSettings(null);
    } finally {
      setDietLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
    void refreshDiet();
  }, [refreshHistory, refreshDiet]);

  const openAddMeal = () => {
    setAddDishName('');
    setAddMealSlot('');
    setAddCookedOn(todayISO());
    setAddNotes('');
    setAddError(null);
    setAddModalVisible(true);
  };

  const handleAddMeal = async () => {
    const name = addDishName.trim();
    if (!name) {
      setAddError('Enter what you ate.');
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      await api.logCookedDish({
        dish_name: name,
        meal_slot: addMealSlot || undefined,
        source: 'manual',
        notes: addNotes.trim() || undefined,
        cooked_on: addCookedOn.trim() || todayISO(),
      });
      setAddModalVisible(false);
      await refreshHistory();
    } catch {
      setAddError('Could not save. Check you are signed in and the backend is running.');
    } finally {
      setAddSaving(false);
    }
  };

  const toggleDietEmail = async (enabled: boolean) => {
    setDietSaving(true);
    try {
      const s = await api.updateDietAnalysisSettings(enabled);
      setDietSettings(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update';
      window.alert(msg);
    } finally {
      setDietSaving(false);
    }
  };

  const eliteUpgrades = (entitlements?.upgrade_options ?? []).filter((o) => o.target.tier === 'elite');
  const elitePlans = (entitlements?.available_plans ?? []).filter(
    (p) => p.tier === 'elite' && p.available_for_purchase,
  );

  return (
    <View style={styles.wrap}>
      <Surface style={styles.dietCard} elevation={1}>
        <View style={styles.dietHeader}>
          <Icon source="chart-line" size={28} color="#6A1B9A" />
          <View style={styles.dietHeaderText}>
            <Text variant="titleMedium" style={styles.dietTitle}>Diet analysis</Text>
            <Text variant="bodySmall" style={styles.dietSub}>
              Nightly PDF with Groq nutrition analysis, macros, micronutrients, and charts for everything you logged.
            </Text>
          </View>
        </View>

        {dietLoading ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color="#6A1B9A" />
        ) : dietSettings?.eligible ? (
          <>
            <Text variant="bodySmall" style={styles.dietMeta}>
              {dietSettings.delivery_summary}
              {dietSettings.email ? ` · ${dietSettings.email}` : ''}
            </Text>
            {!dietSettings.smtp_configured ? (
              <Text variant="bodySmall" style={styles.warn}>
                Email delivery is not configured on the server yet (SMTP).
              </Text>
            ) : null}
            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Email me my daily meal summary</Text>
              <Switch
                value={dietSettings.email_enabled}
                onValueChange={(v) => void toggleDietEmail(v)}
                disabled={dietSaving || !dietSettings.smtp_configured}
                color="#6A1B9A"
              />
            </View>
          </>
        ) : (
          <>
            <Text variant="bodySmall" style={styles.dietMeta}>
              Upgrade to Elite for AI diet insights and the nightly digest. Pro covers meal suggestions only.
            </Text>
            {eliteUpgrades.length > 0
              ? eliteUpgrades.map((opt) => (
                  <Button
                    key={`${opt.target.tier}-${opt.target.interval}`}
                    mode="contained"
                    icon="crown"
                    onPress={() => void subscribe(opt.target.tier, opt.target.interval)}
                    loading={upgradeBusy}
                    disabled={upgradeBusy}
                    style={styles.eliteBtn}
                    buttonColor="#6A1B9A"
                  >
                    {`Upgrade to Elite · ${opt.amount_label || opt.target.price_label}`}
                  </Button>
                ))
              : elitePlans.map((p) => (
                  <Button
                    key={`${p.tier}-${p.interval}`}
                    mode="contained"
                    icon="crown"
                    onPress={() => void subscribe(p.tier, p.interval)}
                    loading={upgradeBusy}
                    disabled={upgradeBusy}
                    style={styles.eliteBtn}
                    buttonColor="#6A1B9A"
                  >
                    {`Upgrade to Elite · ${p.price_label}`}
                  </Button>
                ))}
          </>
        )}
      </Surface>

      <View style={styles.historyHeader}>
        <View>
          <Text variant="titleMedium" style={styles.historyTitle}>Recent meals</Text>
          <Text variant="bodySmall" style={styles.historySubtitle}>Last 15 days · anything you ate</Text>
        </View>
        <Button mode="contained" icon="plus" compact onPress={openAddMeal} buttonColor="#7B1FA2">
          Log meal
        </Button>
      </View>

      {mealHistory.length === 0 ? (
        <Surface style={styles.historyEmpty} elevation={0}>
          <Text variant="bodySmall" style={styles.historyEmptyText}>
            Log breakfast, lunch, snacks — homemade or restaurant. These feed your nightly diet email.
          </Text>
          <Button mode="outlined" icon="plus" onPress={openAddMeal} textColor="#7B1FA2">
            Log your first meal
          </Button>
        </Surface>
      ) : (
        mealHistory.map((entry) => (
          <Surface key={entry.id} style={styles.historyRow} elevation={0}>
            <View style={styles.historyDot} />
            <View style={styles.historyBody}>
              <Text variant="bodyMedium" style={styles.historyName} numberOfLines={2}>
                {entry.dish_name}
              </Text>
              <Text variant="bodySmall" style={styles.historyMeta}>
                {entry.cooked_on}
                {entry.meal_slot ? ` · ${entry.meal_slot}` : ''}
                {entry.notes ? ` · ${entry.notes}` : ''}
              </Text>
            </View>
            {entry.source !== 'manual' ? (
              <Chip compact style={styles.sourceChip} textStyle={styles.sourceChipText}>
                {SOURCE_LABELS[entry.source] || entry.source}
              </Chip>
            ) : null}
          </Surface>
        ))
      )}

      <Portal>
        <Modal visible={addModalVisible} onDismiss={() => setAddModalVisible(false)} contentContainerStyle={styles.addModal}>
          <Text variant="titleLarge">Log a meal</Text>
          <Text variant="bodySmall" style={styles.addModalSub}>
            Any dish — not limited to the meal catalog.
          </Text>
          <Divider style={styles.divider} />
          <TextInput
            label="What did you eat?"
            value={addDishName}
            onChangeText={setAddDishName}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. Poha, office canteen thali"
          />
          <Text variant="labelMedium" style={styles.slotLabel}>Meal (optional)</Text>
          <View style={styles.slotRow}>
            {MEAL_SLOTS.map((slot) => {
              const selected = addMealSlot === slot.id;
              return (
                <Chip
                  key={slot.id}
                  compact
                  selected={selected}
                  onPress={() => setAddMealSlot(selected ? '' : slot.id)}
                  style={selected ? styles.slotChipOn : undefined}
                >
                  {slot.label}
                </Chip>
              );
            })}
          </View>
          <TextInput label="Date" value={addCookedOn} onChangeText={setAddCookedOn} mode="outlined" style={styles.input} />
          <TextInput label="Notes (optional)" value={addNotes} onChangeText={setAddNotes} mode="outlined" style={styles.input} multiline />
          {addError ? <Text style={styles.err}>{addError}</Text> : null}
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setAddModalVisible(false)} disabled={addSaving}>
              Cancel
            </Button>
            <Button mode="contained" onPress={() => void handleAddMeal()} loading={addSaving} buttonColor="#7B1FA2">
              Save
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  dietCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: '#FAF5FC',
    borderWidth: 1,
    borderColor: '#E1BEE7',
  },
  dietHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  dietHeaderText: { flex: 1 },
  dietTitle: { fontWeight: '800', color: '#4A148C' },
  dietSub: { color: '#666', marginTop: 4, lineHeight: 18 },
  dietMeta: { color: '#555', lineHeight: 18, marginBottom: 8 },
  warn: { color: '#E65100', marginBottom: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  eliteBtn: { marginTop: 8, borderRadius: 12 },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  historyTitle: { fontWeight: '700', color: '#333' },
  historySubtitle: { color: '#888', marginTop: 2 },
  historyEmpty: {
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  historyEmptyText: { color: '#666', textAlign: 'center', lineHeight: 20 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7B1FA2' },
  historyBody: { flex: 1 },
  historyName: { fontWeight: '600', color: '#222' },
  historyMeta: { color: '#888', marginTop: 2 },
  sourceChip: { backgroundColor: '#F3E5F5' },
  sourceChipText: { fontSize: 10 },
  addModal: { margin: 24, padding: 20, borderRadius: 16, backgroundColor: '#fff' },
  addModalSub: { color: '#666', marginTop: 4, marginBottom: 8 },
  divider: { marginVertical: 12 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  slotLabel: { marginBottom: 6, color: '#666' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  slotChipOn: { backgroundColor: '#F3E5F5' },
  err: { color: '#C62828', marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
});
