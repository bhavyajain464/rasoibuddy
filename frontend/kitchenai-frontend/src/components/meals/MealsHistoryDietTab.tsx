import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Surface,
  Button,
  Chip,
  Switch,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import * as api from '../../services/api';
import { CookedLogEntry, DietAnalysisSettings } from '../../types';
import { useUpgradePaywall } from '../../context/UpgradePaywallContext';
import { showAppError } from '../../utils/alertMessage';
import { LogMealModal } from '../modals/LogMealModal';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Logged',
  'whatsapp-parsed': 'WhatsApp',
  'cook-reported': 'From cook',
};

type Props = {
  openAddOnMount?: boolean;
  onAddModalOpened?: () => void;
};

export function MealsHistoryDietTab({ openAddOnMount, onAddModalOpened }: Props) {
  const { openUpgrade } = useUpgradePaywall();
  const [mealHistory, setMealHistory] = useState<CookedLogEntry[]>([]);
  const [dietSettings, setDietSettings] = useState<DietAnalysisSettings | null>(null);
  const [dietLoading, setDietLoading] = useState(true);
  const [dietSaving, setDietSaving] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

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

  useEffect(() => {
    if (openAddOnMount) {
      setAddModalVisible(true);
      onAddModalOpened?.();
    }
  }, [openAddOnMount, onAddModalOpened]);

  const openAddMeal = () => {
    setAddModalVisible(true);
  };

  const toggleDietEmail = async (enabled: boolean) => {
    setDietSaving(true);
    try {
      const s = await api.updateDietAnalysisSettings(enabled);
      setDietSettings(s);
    } catch {
      showAppError('Could not update diet email settings.');
    } finally {
      setDietSaving(false);
    }
  };

  const openDietUpgrade = () => {
    openUpgrade({ source: 'diet_analysis', preferredTier: 'elite', preferredInterval: 'monthly' });
  };

  return (
    <View style={styles.wrap}>
      <Surface style={styles.dietCard} elevation={1}>
        <View style={styles.dietHeader}>
          <Icon source="chart-line" size={28} color="#2E7D32" />
          <View style={styles.dietHeaderText}>
            <Text variant="titleMedium" style={styles.dietTitle}>Diet analysis</Text>
          </View>
        </View>

        {dietLoading ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color="#2E7D32" />
        ) : dietSettings?.eligible ? (
          <>
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
                color="#2E7D32"
              />
            </View>
          </>
        ) : (
          <>
            <Text variant="bodySmall" style={styles.dietMeta}>
              Upgrade to Elite for AI diet insights and the nightly digest. Pro covers meal suggestions only.
            </Text>
            <Button
              mode="contained"
              icon="crown"
              onPress={openDietUpgrade}
              style={styles.eliteBtn}
              buttonColor="#2E7D32"
            >
              Upgrade to Elite
            </Button>
          </>
        )}
      </Surface>

      <View style={styles.historyHeader}>
        <View>
          <Text variant="titleMedium" style={styles.historyTitle}>Recent meals</Text>
          <Text variant="bodySmall" style={styles.historySubtitle}>Last 15 days · anything you ate</Text>
        </View>
        <Button mode="contained" icon="plus" compact onPress={openAddMeal} buttonColor="#2E7D32">
          Log meal
        </Button>
      </View>

      {mealHistory.length === 0 ? (
        <Surface style={styles.historyEmpty} elevation={0}>
          <Text variant="bodySmall" style={styles.historyEmptyText}>
            Log breakfast, lunch, snacks — homemade or restaurant. These feed your nightly diet email.
          </Text>
          <Button mode="outlined" icon="plus" onPress={openAddMeal} textColor="#2E7D32">
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

      <LogMealModal
        visible={addModalVisible}
        onDismiss={() => setAddModalVisible(false)}
        onLogged={() => void refreshHistory()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  dietCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: '#F1F8E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  dietHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  dietHeaderText: { flex: 1 },
  dietTitle: { fontWeight: '800', color: '#1A1A1A' },
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
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E7D32' },
  historyBody: { flex: 1 },
  historyName: { fontWeight: '600', color: '#222' },
  historyMeta: { color: '#888', marginTop: 2 },
  sourceChip: { backgroundColor: '#E8F5E9' },
  sourceChipText: { fontSize: 10 },
});
