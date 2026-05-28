import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import {
  Text,
  Surface,
  Avatar,
  ActivityIndicator,
  Badge,
  IconButton,
  Icon,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { InventoryItem, ExpiringItem } from '../types';
import { MessageImportCard } from '../components/MessageImportCard';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatItemName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function expiringDaysLabel(days: number): { text: string; urgent: boolean } {
  if (days <= 0) return { text: 'Today', urgent: true };
  if (days === 1) return { text: '1 day', urgent: true };
  if (days <= 2) return { text: `${days} days`, urgent: true };
  return { text: `${days} days`, urgent: false };
}

const EXPIRING_PREVIEW = 4;

export function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [inv, exp, expd, shop] = await Promise.all([
        api.fetchInventory().catch(() => []),
        api.fetchExpiringItems().catch(() => []),
        api.fetchExpiredItems().catch(() => []),
        api.getShoppingItems().catch(() => []),
      ]);
      setInventory(inv || []);
      setExpiringItems(exp || []);
      setExpiredItems(expd || []);
      setShoppingCount(shop.filter((s) => !s.bought).length);
    } catch {
      setInventory([]);
      setExpiringItems([]);
      setExpiredItems([]);
      setShoppingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom, 16) + 84 },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero Header ──────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text variant="bodyMedium" style={styles.greeting}>{getGreeting()},</Text>
            <Text variant="headlineMedium" style={styles.heroName}>{firstName}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Profile')}>
            <Avatar.Text
              size={48}
              label={user?.name?.charAt(0).toUpperCase() || 'U'}
              style={styles.avatar}
              labelStyle={{ fontSize: 20, fontWeight: '700' }}
            />
          </Pressable>
        </View>

        {/* Summary pills */}
        <View style={styles.pillRow}>
          <Surface style={styles.pill} elevation={0}>
            <Text style={styles.pillValue}>{inventory.length}</Text>
            <Text style={styles.pillLabel}>items in stock</Text>
          </Surface>
          {expiringItems.length > 0 && (
            <Surface style={[styles.pill, styles.pillWarn]} elevation={0}>
              <Text style={[styles.pillValue, { color: '#E65100' }]}>{expiringItems.length}</Text>
              <Text style={[styles.pillLabel, { color: '#E65100' }]}>expiring soon</Text>
            </Surface>
          )}
          {expiredItems.length > 0 && (
            <Surface style={[styles.pill, styles.pillDanger]} elevation={0}>
              <Text style={[styles.pillValue, { color: '#C62828' }]}>{expiredItems.length}</Text>
              <Text style={[styles.pillLabel, { color: '#C62828' }]}>expired</Text>
            </Surface>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <>
          <MessageImportCard />

          {/* ── Quick Actions Grid ────────────────────────── */}
          <Text variant="titleMedium" style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.grid}>
            <ActionCard
              icon="package-variant"
              label="Inventory"
              subtitle={`${inventory.length} items`}
              color="#4CAF50"
              bg="#E8F5E9"
              onPress={() => navigation.navigate('Inventory')}
            />
            <ActionCard
              icon="silverware-fork-knife"
              label="Meal Ideas"
              subtitle="AI powered"
              color="#FF9800"
              bg="#FFF3E0"
              onPress={() => navigation.navigate('Meals')}
            />
            <ActionCard
              icon="cart-outline"
              label="Shopping"
              subtitle={shoppingCount > 0 ? `${shoppingCount} items` : 'List empty'}
              color="#2196F3"
              bg="#E3F2FD"
              badge={shoppingCount > 0 ? shoppingCount : undefined}
              onPress={() => navigation.navigate('Shopping')}
            />
            <ActionCard
              icon="chef-hat"
              label="Cook"
              subtitle="Send instructions"
              color="#9C27B0"
              bg="#F3E5F5"
              onPress={() => navigation.navigate('Cook')}
            />
          </View>

          {/* ── Expired Items Alert ───────────────────────── */}
          {expiredItems.length > 0 && (
            <Pressable
              onPress={() => navigation.navigate('Inventory', { tab: 'expired' })}
              style={styles.expiredBanner}
            >
              <View style={styles.expiredBannerIcon}>
                <IconButton icon="alert-circle" iconColor="#C62828" size={24} style={{ margin: 0 }} />
              </View>
              <View style={styles.expiredBannerText}>
                <Text variant="titleSmall" style={{ color: '#C62828', fontWeight: '700' }}>
                  {expiredItems.length} expired item{expiredItems.length !== 1 ? 's' : ''}
                </Text>
                <Text variant="bodySmall" style={{ color: '#D32F2F' }}>
                  Tap to review & reorder
                </Text>
              </View>
              <IconButton icon="chevron-right" iconColor="#C62828" size={20} style={{ margin: 0 }} />
            </Pressable>
          )}

          {/* ── Expiring Soon ─────────────────────────────── */}
          {expiringItems.length > 0 && (
            <View
              style={[
                styles.expiringSection,
                expiredItems.length === 0 && styles.expiringSectionStandalone,
              ]}
            >
              <Surface style={styles.expiringPanel} elevation={1}>
                <Pressable
                  onPress={() => navigation.navigate('Inventory', { expiringSoon: true })}
                  style={({ pressed }) => [styles.expiringPanelHeader, pressed && { opacity: 0.92 }]}
                >
                  <View style={styles.expiringTitleRow}>
                    <View style={styles.expiringIconWrap}>
                      <Icon source="clock-alert-outline" size={20} color="#E65100" />
                    </View>
                    <Text variant="titleSmall" style={styles.expiringPanelTitle}>
                      Expiring soon
                    </Text>
                    <View style={styles.expiringCountPill}>
                      <Text style={styles.expiringCountText}>{expiringItems.length}</Text>
                    </View>
                  </View>
                  <Icon source="chevron-right" size={22} color="#BF360C" />
                </Pressable>

                <View style={styles.expiringList}>
                  {expiringItems.slice(0, EXPIRING_PREVIEW).map((item, index, preview) => {
                    const { text: daysText, urgent } = expiringDaysLabel(item.days_until_expiry);
                    const isLast = index === preview.length - 1;
                    return (
                      <Pressable
                        key={item.item_id}
                        onPress={() => navigation.navigate('Inventory', { expiringSoon: true })}
                        style={({ pressed }) => [
                          styles.expiringRow,
                          !isLast && styles.expiringRowBorder,
                          pressed && styles.expiringRowPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.expiringRowAccent,
                            urgent ? styles.expiringRowAccentUrgent : styles.expiringRowAccentWarn,
                          ]}
                        />
                        <View style={styles.expiringRowBody}>
                          <Text variant="bodyMedium" style={styles.expiringRowName} numberOfLines={1}>
                            {formatItemName(item.canonical_name)}
                          </Text>
                          <Text variant="bodySmall" style={styles.expiringRowQty} numberOfLines={1}>
                            {item.qty} {item.unit}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.expiringDaysPill,
                            urgent ? styles.expiringDaysPillUrgent : styles.expiringDaysPillWarn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.expiringDaysText,
                              urgent ? styles.expiringDaysTextUrgent : styles.expiringDaysTextWarn,
                            ]}
                          >
                            {daysText}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {expiringItems.length > EXPIRING_PREVIEW ? (
                  <Pressable
                    onPress={() => navigation.navigate('Inventory', { expiringSoon: true })}
                    style={({ pressed }) => [styles.expiringMoreBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.expiringMoreText}>
                      +{expiringItems.length - EXPIRING_PREVIEW} more · View all
                    </Text>
                  </Pressable>
                ) : null}
              </Surface>
            </View>
          )}

          {inventory.length === 0 &&
          expiringItems.length === 0 &&
          expiredItems.length === 0 ? (
            <Pressable
              onPress={() => navigation.navigate('Inventory')}
              style={styles.emptyPantry}
            >
              <Surface style={styles.emptyPantryCard} elevation={1}>
                <IconButton icon="fridge-outline" size={32} iconColor="#81C784" style={{ margin: 0 }} />
                <Text variant="titleSmall" style={styles.emptyPantryTitle}>
                  Your kitchen is empty
                </Text>
                <Text variant="bodySmall" style={styles.emptyPantrySub}>
                  Scan a bill or add items to get meal ideas
                </Text>
              </Surface>
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/* ── Action Card Component ────────────────────────────────── */

function ActionCard({ icon, label, subtitle, color, bg, badge, onPress }: {
  icon: string;
  label: string;
  subtitle: string;
  color: string;
  bg: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85 }]}>
      <Surface style={[styles.actionSurface, { backgroundColor: bg }]} elevation={1}>
        <View style={styles.actionIconWrap}>
          <IconButton icon={icon} iconColor={color} size={28} style={{ margin: 0 }} />
          {badge !== undefined && (
            <Badge style={styles.actionBadge}>{badge}</Badge>
          )}
        </View>
        <Text variant="titleSmall" style={[styles.actionLabel, { color }]}>{label}</Text>
        <Text variant="bodySmall" style={styles.actionSub}>{subtitle}</Text>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingBottom: 34,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
  },
  heroName: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 28,
    marginTop: 6,
  },
  avatar: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  pillRow: {
    flexDirection: 'row',
    marginTop: 22,
    gap: 10,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pillWarn: {
    backgroundColor: '#FFF3E0',
  },
  pillDanger: {
    backgroundColor: '#FFEBEE',
  },
  pillValue: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  pillLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },

  // Sections
  sectionTitle: {
    fontWeight: '700',
    marginLeft: 24,
    marginTop: 24,
    marginBottom: 6,
    color: '#333',
  },
  expiringSection: {
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 20,
  },
  expiringSectionStandalone: {
    marginTop: 20,
  },
  expiringPanel: {
    borderRadius: 16,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE0B2',
    overflow: 'hidden',
  },
  expiringPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 152, 0, 0.2)',
  },
  expiringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  expiringIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFE0B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiringPanelTitle: {
    fontWeight: '800',
    color: '#BF360C',
    flex: 1,
  },
  expiringCountPill: {
    backgroundColor: '#FF9800',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  expiringCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  expiringList: {
    backgroundColor: '#fff',
  },
  expiringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 14,
    paddingLeft: 0,
    backgroundColor: '#fff',
  },
  expiringRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  expiringRowPressed: {
    backgroundColor: '#FFFDE7',
  },
  expiringRowAccent: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
    borderRadius: 2,
  },
  expiringRowAccentUrgent: {
    backgroundColor: '#FF5722',
  },
  expiringRowAccentWarn: {
    backgroundColor: '#FFB74D',
  },
  expiringRowBody: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  expiringRowName: {
    fontWeight: '700',
    color: '#212121',
  },
  expiringRowQty: {
    color: '#757575',
    marginTop: 2,
  },
  expiringDaysPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  expiringDaysPillUrgent: {
    backgroundColor: '#FFEBEE',
  },
  expiringDaysPillWarn: {
    backgroundColor: '#FFF3E0',
  },
  expiringDaysText: {
    fontSize: 12,
    fontWeight: '800',
  },
  expiringDaysTextUrgent: {
    color: '#D84315',
  },
  expiringDaysTextWarn: {
    color: '#E65100',
  },
  expiringMoreBtn: {
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FFE0B2',
  },
  expiringMoreText: {
    color: '#E65100',
    fontWeight: '700',
    fontSize: 13,
  },

  // Action grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    marginTop: 10,
    gap: 0,
  },
  actionCard: {
    width: '50%',
    padding: 7,
  },
  actionSurface: {
    borderRadius: 20,
    padding: 18,
    minHeight: 132,
    justifyContent: 'center',
  },
  actionIconWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#F44336',
  },
  actionLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  actionSub: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },

  // Expired banner
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 0,
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    padding: 12,
  },
  expiredBannerIcon: {
    marginRight: 4,
  },
  expiredBannerText: {
    flex: 1,
  },

  emptyPantry: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 20,
  },
  emptyPantryCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  emptyPantryTitle: {
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  emptyPantrySub: {
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
});
