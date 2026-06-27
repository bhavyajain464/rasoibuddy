import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { TextInput, Icon } from 'react-native-paper';

const SEND_SIZE = 40;

type MessageComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  accentColor?: string;
  borderColor?: string;
  submitIcon?: string;
  accessibilityLabel?: string;
  /** When false, send via keyboard return only (no circular arrow button). */
  showSubmitButton?: boolean;
  /** Chat-style multiline input (Enter sends on blurSubmit false). */
  multiline?: boolean;
};

export function MessageComposer({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Type your message…',
  disabled = false,
  loading = false,
  accentColor = '#2E7D32',
  borderColor = '#C8E6C9',
  submitIcon = 'arrow-right',
  accessibilityLabel = 'Send',
  showSubmitButton = true,
  multiline = false,
}: MessageComposerProps) {
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0 && !disabled && !loading;
  const isEmpty = value.trim().length === 0;

  return (
    <View
      style={[
        styles.composer,
        { borderColor: focused ? accentColor : borderColor },
        multiline && styles.composerMultiline,
        focused && styles.composerFocused,
        !showSubmitButton && styles.composerNoButton,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        mode="flat"
        dense
        placeholder={placeholder}
        placeholderTextColor="#9E9E9E"
        style={[styles.input, isEmpty && styles.inputPlaceholder]}
        contentStyle={styles.inputContent}
        underlineColor="transparent"
        activeUnderlineColor="transparent"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={canSubmit && !multiline ? onSubmit : undefined}
        returnKeyType={multiline ? 'default' : 'send'}
        blurOnSubmit={!multiline}
        editable={!loading && !disabled}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlign={isEmpty && !multiline ? 'center' : 'left'}
      />
      {showSubmitButton ? (
        <View style={styles.sendBtnWrap}>
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: canSubmit ? accentColor : '#BDBDBD' },
              pressed && canSubmit && styles.sendBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon source={submitIcon} size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.sendBtnWrap}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SEND_SIZE + 12,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#FAFAFA',
    paddingLeft: 4,
    paddingRight: 2,
  },
  composerFocused: {
    backgroundColor: '#fff',
  },
  composerMultiline: {
    alignItems: 'flex-end',
    minHeight: SEND_SIZE + 28,
  },
  composerNoButton: {
    paddingRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 0,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    minHeight: SEND_SIZE - 4,
  },
  inputContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  inputPlaceholder: {
    textAlignVertical: 'center',
  },
  sendBtnWrap: {
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 6,
  },
  sendBtn: {
    width: SEND_SIZE,
    height: SEND_SIZE,
    borderRadius: SEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.9,
  },
});
