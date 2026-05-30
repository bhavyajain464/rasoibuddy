import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Icon, Portal, Text } from 'react-native-paper';

export type AppConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  warning?: boolean;
  loading?: boolean;
  icon?: string;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function AppConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  warning = false,
  loading = false,
  icon,
  onDismiss,
  onConfirm,
}: AppConfirmDialogProps) {
  const accent = destructive ? '#F44336' : warning ? '#FF9800' : '#2E7D32';
  const iconName = icon ?? (destructive ? 'delete-outline' : warning ? 'clock-alert-outline' : 'help-circle-outline');
  const confirmColor = destructive ? '#F44336' : warning ? '#FF9800' : '#2E7D32';

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
            <Icon source={iconName} size={28} color={accent} />
          </View>
          <Text variant="titleLarge" style={styles.title}>
            {title}
          </Text>
        </View>
        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button
            mode="outlined"
            onPress={onDismiss}
            disabled={loading}
            style={styles.cancelBtn}
            textColor="#555"
          >
            {cancelLabel}
          </Button>
          <Button
            mode="contained"
            onPress={onConfirm}
            loading={loading}
            disabled={loading}
            buttonColor={confirmColor}
            style={styles.confirmBtn}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 20,
    maxWidth: 400,
    width: '92%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 20,
    color: '#1a1a1a',
    marginTop: 0,
    marginBottom: 0,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  message: {
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderColor: '#E0E0E0',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
  },
});
