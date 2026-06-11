import React, { useState } from 'react';
import { View, StyleSheet, Platform, Linking } from 'react-native';
import { Portal, Modal, Text, Button, ActivityIndicator, Icon } from 'react-native-paper';
import * as api from '../services/api';
import { CommercePartner, UserShoppingItem } from '../types';
import { copyToClipboard } from '../utils/copyToClipboard';
import { showAppError, showAppSuccess } from '../utils/alertMessage';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: UserShoppingItem[];
  partners: CommercePartner[];
  source?: string;
};

// OrderOnlineSheet lets the user open their grocery list in a quick-commerce app.
// Phase 0: opens the partner (deep/affiliate link) and copies the list to the clipboard
// so they can paste-and-search. No partnership required.
export function OrderOnlineSheet({ visible, onClose, items, partners, source = 'shopping_list' }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const handlePick = async (partner: CommercePartner) => {
    if (busy) return;
    setBusy(partner.id);
    try {
      const payload = items
        .filter((it) => it.name && it.name.trim())
        .map((it) => ({ name: it.name, qty: it.qty, unit: it.unit }));
      const res = await api.createOrderLink(partner.id, payload, source);

      // Copy the list first so it's ready to paste in the partner's search.
      if (res.copy_text) {
        await copyToClipboard(res.copy_text).catch(() => undefined);
      }
      if (Platform.OS === 'web') {
        window.open(res.url, '_blank');
      } else {
        const ok = await Linking.canOpenURL(res.url).catch(() => true);
        if (ok) await Linking.openURL(res.url);
      }
      showAppSuccess(`List copied — opening ${partner.name}. Paste in search to add items.`);
      onClose();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not open ordering. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onClose} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>
          Order your list online
        </Text>
        <Text variant="bodySmall" style={styles.sub}>
          We&apos;ll copy your list and open the app — paste it into search to add items quickly.
        </Text>
        <View style={styles.partners}>
          {partners.map((p) => (
            <Button
              key={p.id}
              mode="outlined"
              icon={() => <Icon source="cart-arrow-right" size={18} color="#2E7D32" />}
              loading={busy === p.id}
              disabled={!!busy}
              onPress={() => handlePick(p)}
              style={styles.partnerBtn}
              contentStyle={styles.partnerBtnContent}
              textColor="#1B5E20"
            >
              {p.eta ? `${p.name} · ${p.eta}` : p.name}
            </Button>
          ))}
        </View>
        <Button onPress={onClose} disabled={!!busy} textColor="#888" style={{ marginTop: 4 }}>
          Cancel
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
  },
  title: { color: '#1A1A1A', fontWeight: '600' },
  sub: { color: '#666', marginTop: 4, marginBottom: 14 },
  partners: { gap: 10 },
  partnerBtn: { borderColor: '#A5D6A7', borderRadius: 12 },
  partnerBtnContent: { height: 46, justifyContent: 'flex-start' },
});
