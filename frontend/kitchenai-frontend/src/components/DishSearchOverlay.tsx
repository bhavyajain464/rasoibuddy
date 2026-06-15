import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DISH_CATALOG_SEARCH, type CatalogDishSearchItem } from '../data/dishCatalogSearch';
import { DishImage } from './DishImage';
import {
  DISH_ROW_MIN_HEIGHT,
  MAX_DISH_SEARCH_RESULTS,
  filterDishCatalog,
} from '../utils/dishSearch';
import { palette } from '../theme';

type Props = {
  visible: boolean;
  mealSlot?: string;
  title?: string;
  onClose: () => void;
  onSelect: (dish: CatalogDishSearchItem) => void;
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export function DishSearchOverlay({
  visible,
  mealSlot,
  title,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<RNTextInput>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [visible, mealSlot]);

  const options = useMemo(
    () => filterDishCatalog(DISH_CATALOG_SEARCH, query, mealSlot, MAX_DISH_SEARCH_RESULTS),
    [query, mealSlot],
  );

  const headerTitle = title ?? (mealSlot
    ? `Choose ${SLOT_LABELS[mealSlot] ?? mealSlot} dish`
    : 'Choose a dish');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <IconButton icon="close" size={24} onPress={onClose} accessibilityLabel="Close search" />
          <Text variant="titleMedium" style={styles.headerTitle}>
            {headerTitle}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchWrap}>
          <RNTextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            placeholder="Search dishes…"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          ListEmptyComponent={(
            <Text style={styles.empty}>No dishes match</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <DishImage
                dishId={item.id}
                dishName={item.name}
                variant="card"
                width={44}
                borderRadius={10}
                accessibilityLabel={item.name}
              />
              <View style={styles.rowCopy}>
                <Text style={styles.rowName} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.cookTimeMins > 0 ? (
                  <Text style={styles.rowMeta}>{item.cookTimeMins} min</Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    color: palette.text,
  },
  headerSpacer: {
    width: 48,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderLight,
  },
  searchInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.background,
    paddingHorizontal: 14,
    fontSize: 17,
    color: palette.text,
  },
  listContent: {
    flexGrow: 1,
  },
  row: {
    minHeight: DISH_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderLight,
  },
  rowPressed: {
    backgroundColor: palette.background,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
    lineHeight: 22,
  },
  rowMeta: {
    fontSize: 13,
    color: palette.textMuted,
    flexShrink: 0,
  },
  empty: {
    textAlign: 'center',
    color: palette.textMuted,
    paddingVertical: 32,
    fontSize: 15,
  },
});
