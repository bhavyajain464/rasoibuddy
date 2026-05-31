import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Icon, Portal, Text } from 'react-native-paper';
import { palette } from '../theme';
import {
  DEFAULT_UNIT,
  UNIT_OPTIONS,
  normalizeUnit,
} from '../utils/units';

export { DEFAULT_UNIT, UNIT_OPTIONS, normalizeUnit };

type MenuRect = {
  top: number;
  left: number;
  width: number;
};

type UnitDropdownProps = {
  value: string;
  onChange: (unit: string) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: ViewStyle;
  /** Portals the menu as a floating overlay (use inside bottom sheets). */
  overlay?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function MenuOptions({
  display,
  onSelect,
}: {
  display: string;
  onSelect: (unit: string) => void;
}) {
  return (
    <>
      {UNIT_OPTIONS.map((unit, index) => {
        const selected = display === unit;
        const isLast = index === UNIT_OPTIONS.length - 1;
        return (
          <Pressable
            key={unit}
            onPress={() => onSelect(unit)}
            style={({ pressed }) => [
              styles.option,
              !isLast && styles.optionBorder,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
          >
            {selected ? (
              <Icon source="check" size={16} color={palette.primary} />
            ) : (
              <View style={styles.checkSpacer} />
            )}
            <Text
              variant="bodyMedium"
              style={[styles.optionText, selected && styles.optionTextSelected]}
            >
              {unit}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

export function UnitDropdown({
  value,
  onChange,
  label,
  disabled = false,
  compact = false,
  style,
  overlay = false,
  open: controlledOpen,
  onOpenChange,
}: UnitDropdownProps) {
  const anchorRef = useRef<View>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const open = controlledOpen ?? internalOpen;
  const display = normalizeUnit(value);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
      if (!next) setMenuRect(null);
    },
    [controlledOpen, onOpenChange],
  );

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuRect({
        top: y + height + 4,
        left: x,
        width,
      });
    });
  }, []);

  useEffect(() => {
    if (!open || !overlay) {
      setMenuRect(null);
      return;
    }
    const id = requestAnimationFrame(() => {
      measureAnchor();
    });
    return () => cancelAnimationFrame(id);
  }, [open, overlay, measureAnchor]);

  const selectUnit = (unit: string) => {
    onChange(unit);
    setOpen(false);
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    if (overlay) {
      measureAnchor();
    }
    setOpen(true);
  };

  const inlineMenu = open && !overlay ? (
    <View style={[styles.menu, styles.menuInline]}>
      <ScrollView
        style={styles.menuScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <MenuOptions display={display} onSelect={selectUnit} />
      </ScrollView>
    </View>
  ) : null;

  const overlayMenu =
    overlay && open && menuRect ? (
      <Portal>
        <View style={styles.portalLayer} pointerEvents="box-none">
          <Pressable
            style={styles.portalScrim}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close unit menu"
          />
          <View
            style={[
              styles.menu,
              styles.menuFloating,
              {
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
              },
            ]}
          >
            <ScrollView
              style={styles.menuScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <MenuOptions display={display} onSelect={selectUnit} />
            </ScrollView>
          </View>
        </View>
      </Portal>
    ) : null;

  return (
    <View style={[styles.root, style]}>
      {label ? (
        <Text variant="labelSmall" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View ref={anchorRef} style={styles.anchor} collapsable={false}>
        <Pressable
          onPress={toggleOpen}
          disabled={disabled}
          style={({ pressed }) => [
            styles.trigger,
            compact && styles.triggerCompact,
            open && styles.triggerOpen,
            pressed && styles.triggerPressed,
            disabled && styles.triggerDisabled,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text
            variant="bodyMedium"
            style={[styles.triggerText, compact && styles.triggerTextCompact]}
            numberOfLines={1}
          >
            {display}
          </Text>
          <Icon
            source={open ? 'chevron-up' : 'chevron-down'}
            size={compact ? 18 : 20}
            color={palette.primary}
          />
        </Pressable>
        {inlineMenu}
      </View>
      {overlayMenu}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  label: {
    color: palette.textSecondary,
    marginBottom: 4,
  },
  anchor: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    width: '100%',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  triggerCompact: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  triggerOpen: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  triggerPressed: {
    backgroundColor: palette.background,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    color: palette.primary,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  triggerTextCompact: {
    fontSize: 12,
  },
  portalLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
    ...(Platform.OS === 'web' ? { position: 'fixed' as ViewStyle['position'] } : {}),
  } as ViewStyle,
  portalScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    ...(Platform.OS === 'web' ? { position: 'fixed' as ViewStyle['position'] } : {}),
  } as ViewStyle,
  menu: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 24,
  },
  menuInline: {
    marginTop: 4,
  },
  menuFloating: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'],
    zIndex: 9999,
    elevation: 9999,
    maxHeight: 200,
  } as ViewStyle,
  menuScroll: {
    maxHeight: 200,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderLight,
  },
  optionSelected: {
    backgroundColor: palette.primaryContainer,
  },
  optionPressed: {
    backgroundColor: palette.background,
  },
  checkSpacer: {
    width: 16,
  },
  optionText: {
    color: palette.text,
    fontSize: 15,
  },
  optionTextSelected: {
    color: palette.primary,
    fontWeight: '700',
  },
});
