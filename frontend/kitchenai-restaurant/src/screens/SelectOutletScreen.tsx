import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { OutletSetupForm } from '../components/outlet/OutletSetupForm';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { palette } from '../theme';

export default function SelectOutletScreen() {
  const { user, signOut } = useAuth();
  const { outlets, switchKitchen, clearOutletPick } = useRestaurant();

  const handlePick = async (id: string) => {
    await switchKitchen(id);
    clearOutletPick();
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" style={styles.title}>
        Choose an outlet
      </Text>
      <Text variant="bodyMedium" style={styles.sub}>
        Hi {user?.name?.split(' ')[0] ?? 'there'} — you have access to multiple outlets. Pick one to continue, or
        create / join another below.
      </Text>

      <View style={styles.list}>
        {outlets.map((o) => {
          const id = o.outlet_id || o.kitchen_id;
          return (
            <Pressable key={id} onPress={() => void handlePick(id)} style={styles.outletRow}>
              <View style={styles.outletRowText}>
                <Text style={styles.outletTitle}>{o.name?.trim() || 'Outlet'}</Text>
                <Text style={styles.meta}>{o.role}</Text>
              </View>
              <Button mode="contained" compact onPress={() => void handlePick(id)} buttonColor={palette.primary} textColor="#0F172A">
                Open
              </Button>
            </Pressable>
          );
        })}
      </View>

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Or add another outlet
      </Text>
      <OutletSetupForm onSuccess={() => clearOutletPick()} />

      <Button mode="text" onPress={signOut} textColor={palette.textMuted} style={styles.signOut}>
        Sign out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: palette.background,
    padding: 24,
    paddingTop: 48,
  },
  title: { color: palette.text, marginBottom: 8 },
  sub: { color: palette.textMuted, marginBottom: 20, lineHeight: 22 },
  list: { marginBottom: 24 },
  outletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
    backgroundColor: palette.surfaceElevated,
  },
  outletRowText: { flex: 1, minWidth: 0 },
  outletTitle: { color: palette.text, fontWeight: '700', fontSize: 15 },
  meta: { color: palette.textMuted, fontSize: 13, marginTop: 2 },
  sectionTitle: { color: palette.text, fontWeight: '700', marginBottom: 12 },
  signOut: { marginTop: 24 },
});
