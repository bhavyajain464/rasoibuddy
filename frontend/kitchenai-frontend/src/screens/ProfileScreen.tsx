import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Pressable,
  Linking,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
  Chip,
  Divider,
  IconButton,
  ActivityIndicator,
  SegmentedButtons,
  Surface,
  Switch,
  Snackbar,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { closeProfile } from '../navigation/rootNavigation';
import type { RootStackParamList } from '../navigation/types';
import { useUpgradePaywall } from '../context/UpgradePaywallContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppConfirmDialog } from '../components/AppConfirmDialog';
import { BottomSheet, bottomSheetPrimaryBtn } from '../components/BottomSheet';
import { useAuth } from '../context/AuthContext';
import { UserProfile, UserMemory, KitchenInfo } from '../types';
import * as api from '../services/api';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade } from '../hooks/usePlanUpgrade';
import { ProfileHeaderUpgrade } from '../components/profile/ProfileHeaderUpgrade';
import { ProfilePlanSettingsSection } from '../components/profile/ProfilePlanSettingsSection';
import { AppUpdateSection } from '../components/profile/AppUpdateSection';
import { showAppError, showAppSuccess, showAppInfo } from '../utils/alertMessage';
import { snackbarLayoutStyles } from '../constants/snackbarLayout';
import { copyToClipboard } from '../utils/copyToClipboard';
import {
  getMealLogRemindersEnabled,
  setMealLogRemindersEnabled,
  isMealLogNotificationSupported,
} from '../services/mealLogNotifications';

const SPICE_LEVELS = ['mild', 'medium', 'spicy', 'extra_spicy'];
const COOKING_SKILLS = ['beginner', 'intermediate', 'advanced'];
const DIETARY_OPTIONS = [
  'vegetarian', 'vegan', 'eggetarian', 'non-veg',
  'jain', 'gluten-free', 'lactose-free', 'keto', 'low-carb',
];
const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Bengali', 'Gujarati',
  'Punjabi', 'Rajasthani', 'Maharashtrian', 'Kerala',
  'Chinese', 'Italian', 'Continental', 'Thai',
];
const MEMORY_CATEGORIES = [
  { value: 'preference', label: 'Preference', icon: 'heart' },
  { value: 'health', label: 'Health', icon: 'medical-bag' },
  { value: 'family', label: 'Family', icon: 'account-group' },
  { value: 'general', label: 'General', icon: 'information' },
];

const SPICE_EMOJI: Record<string, string> = { mild: '🌶', medium: '🌶🌶', spicy: '🌶🌶🌶', extra_spicy: '🔥' };
const MEMORY_DELETE_UNDO_MS = 5000;

type PendingMemoryDelete = {
  memory: UserMemory;
  index: number;
  timer: ReturnType<typeof setTimeout>;
};

type ProfileRouteParams = RootStackParamList['Profile'];

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Profile'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Profile'>>();
  const { openUpgrade } = useUpgradePaywall();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const {
    entitlements,
    loading: entitlementsLoading,
    error: entitlementsError,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const {
    syncLastPayment,
    busy: upgradeBusy,
    busyPlanKey: upgradeBusyPlanKey,
    planLabel,
  } = usePlanUpgrade();

  const openProfileUpgrade = useCallback(() => {
    openUpgrade({ source: 'profile' });
  }, [openUpgrade]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');

  const [householdSize, setHouseholdSize] = useState(2);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState('medium');
  const [cookingSkill, setCookingSkill] = useState('intermediate');

  const [newAllergy, setNewAllergy] = useState('');
  const [newDislike, setNewDislike] = useState('');

  const [memoryContent, setMemoryContent] = useState('');
  const [memoryCategory, setMemoryCategory] = useState('general');
  const [addingMemory, setAddingMemory] = useState(false);
  const [mealLogReminders, setMealLogReminders] = useState(false);
  const [mealLogRemindersLoading, setMealLogRemindersLoading] = useState(false);
  const [kitchen, setKitchen] = useState<KitchenInfo | null>(null);
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [creatingKitchen, setCreatingKitchen] = useState(false);
  const [joiningKitchen, setJoiningKitchen] = useState(false);
  const [leavingKitchen, setLeavingKitchen] = useState(false);
  const [joinKitchenSheetVisible, setJoinKitchenSheetVisible] = useState(false);
  const [joinKitchenSheetStep, setJoinKitchenSheetStep] = useState<'enter' | 'confirm'>('enter');
  const [kitchenName, setKitchenName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    icon?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [snackVisible, setSnackVisible] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const snackUndoRef = useRef<(() => Promise<void>) | null>(null);
  const pendingMemoryDeletesRef = useRef<Map<string, PendingMemoryDelete>>(new Map());

  useEffect(() => {
    return () => {
      pendingMemoryDeletesRef.current.forEach((p) => clearTimeout(p.timer));
      pendingMemoryDeletesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isMealLogNotificationSupported()) return;
    void getMealLogRemindersEnabled().then(setMealLogReminders);
  }, []);

  useEffect(() => {
    if (!route.params?.upgradePlan) return;
    openUpgrade({ source: 'profile' });
    navigation.setParams({ upgradePlan: undefined });
  }, [route.params?.upgradePlan, navigation, openUpgrade]);

  const onToggleMealLogReminders = useCallback(async (enabled: boolean) => {
    if (!isMealLogNotificationSupported()) {
      showAppInfo('Meal log reminders are available on the iOS and Android app.');
      return;
    }
    setMealLogRemindersLoading(true);
    setMealLogReminders(enabled);
    try {
      const result = await setMealLogRemindersEnabled(enabled);
      const on = await getMealLogRemindersEnabled();
      setMealLogReminders(on);
      if (result.ok) {
        if (enabled) {
          showAppSuccess(
            'Reminders on — lunch ~1:30 PM and dinner ~8:00 PM. You should get a short confirmation in a few seconds.',
          );
        }
      } else {
        showAppError(result.message);
        if (result.reason === 'permission_denied') {
          Alert.alert(
            'Notifications blocked',
            result.message,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ],
          );
        }
      }
    } catch {
      showAppError('Could not update notification settings.');
      setMealLogReminders(await getMealLogRemindersEnabled());
    } finally {
      setMealLogRemindersLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchProfile();
      setProfile(data);
      setHouseholdSize(data.household_size || 2);
      setAllergies(data.allergies || []);
      setDislikes(data.dislikes || []);
      setDietaryTags(data.dietary_tags || []);
      setFavCuisines(data.fav_cuisines || []);
      setSpiceLevel(data.spice_level || 'medium');
      setCookingSkill(data.cooking_skill || 'intermediate');
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    try {
      const data = await api.getKitchen();
      setKitchen(data);
      setKitchenName(data.name || '');
    } catch {
      setKitchen(null);
    } finally {
      setKitchenLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    void loadKitchen();
  }, [loadProfile, loadKitchen]);

  useEffect(() => {
    void refreshEntitlements();
  }, [refreshEntitlements]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateProfile({
        household_size: householdSize,
        allergies, dislikes,
        dietary_tags: dietaryTags,
        fav_cuisines: favCuisines,
        spice_level: spiceLevel,
        cooking_skill: cookingSkill,
      });
      showAppSuccess('Profile saved. Meal suggestions will reflect your preferences.');
    } catch {
      showAppError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMemory = async () => {
    if (!memoryContent.trim()) return;
    try {
      setAddingMemory(true);
      const newMem = await api.addMemory(memoryCategory, memoryContent.trim());
      setProfile(prev => prev ? { ...prev, memories: [newMem, ...prev.memories] } : prev);
      setMemoryContent('');
    } catch {
      showAppError('Failed to add memory');
    } finally {
      setAddingMemory(false);
    }
  };

  const commitMemoryDelete = useCallback((memoryId: string) => {
    const pending = pendingMemoryDeletesRef.current.get(memoryId);
    if (!pending) return;
    pendingMemoryDeletesRef.current.delete(memoryId);
    void api.deleteMemory(memoryId).catch(() => {
      setProfile((prev) => {
        if (!prev || prev.memories.some((m) => m.id === memoryId)) return prev;
        const list = [...prev.memories];
        list.splice(Math.min(pending.index, list.length), 0, pending.memory);
        return { ...prev, memories: list };
      });
      showAppError('Failed to delete memory');
    });
  }, []);

  const showMemoryDeleteSnack = useCallback((memory: UserMemory, undo: () => void) => {
    const preview =
      memory.content.length > 48 ? `${memory.content.slice(0, 48).trim()}…` : memory.content;
    snackUndoRef.current = async () => {
      undo();
      return Promise.resolve();
    };
    setSnackMsg(`"${preview}" removed.`);
    setSnackVisible(true);
  }, []);

  const handleDeleteMemory = useCallback(
    (memory: UserMemory) => {
      const existing = pendingMemoryDeletesRef.current.get(memory.id);
      if (existing) {
        clearTimeout(existing.timer);
        pendingMemoryDeletesRef.current.delete(memory.id);
      }

      let removedIndex = 0;
      setProfile((prev) => {
        if (!prev) return prev;
        removedIndex = prev.memories.findIndex((m) => m.id === memory.id);
        if (removedIndex < 0) return prev;
        return { ...prev, memories: prev.memories.filter((m) => m.id !== memory.id) };
      });

      const timer = setTimeout(() => commitMemoryDelete(memory.id), MEMORY_DELETE_UNDO_MS);
      pendingMemoryDeletesRef.current.set(memory.id, { memory, index: removedIndex, timer });

      showMemoryDeleteSnack(memory, () => {
        const pending = pendingMemoryDeletesRef.current.get(memory.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingMemoryDeletesRef.current.delete(memory.id);
        setProfile((prev) => {
          if (!prev || prev.memories.some((m) => m.id === memory.id)) return prev;
          const list = [...prev.memories];
          list.splice(Math.min(pending.index, list.length), 0, pending.memory);
          return { ...prev, memories: list };
        });
      });
    },
    [commitMemoryDelete, showMemoryDeleteSnack],
  );

  const handleConfirmDialog = async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch {
      showAppError('Something went wrong. Try again.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleChip = (value: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const addCustomItem = (text: string, list: string[], setList: (v: string[]) => void, clear: () => void) => {
    const trimmed = text.trim();
    if (trimmed && !list.includes(trimmed)) setList([...list, trimmed]);
    clear();
  };

  const handleSignOut = () => {
    setConfirmDialog({
      title: 'Sign out?',
      message: 'You can sign back in anytime with your Google account.',
      confirmLabel: 'Sign out',
      destructive: true,
      icon: 'logout',
      onConfirm: () => {
        signOut();
      },
    });
  };

  const handleCreateKitchen = async () => {
    try {
      setCreatingKitchen(true);
      const data = await api.createKitchen(kitchenName);
      setKitchen(data);
      setKitchenName(data.name || '');
      showAppSuccess('Kitchen created. Share your invite code with family members.');
    } catch (e) {
      console.error('Create kitchen failed:', e);
      showAppError('Could not create kitchen.');
    } finally {
      setCreatingKitchen(false);
    }
  };

  const closeJoinKitchenSheet = () => {
    setJoinKitchenSheetVisible(false);
    setJoinKitchenSheetStep('enter');
  };

  const openJoinKitchenSheet = () => {
    setJoinKitchenSheetStep('enter');
    setJoinKitchenSheetVisible(true);
  };

  const performJoinKitchen = async (code: string) => {
    setJoiningKitchen(true);
    try {
      const data = await api.joinKitchen(code);
      setKitchen(data);
      setKitchenName(data.name || '');
      setInviteCodeInput('');
      closeJoinKitchenSheet();
      showAppSuccess(`Joined ${data.name}. Shared inventory is now enabled.`);
    } catch (e) {
      console.error('Join kitchen failed:', e);
      showAppError('Could not join kitchen. Check the invite code and try again.');
    } finally {
      setJoiningKitchen(false);
    }
  };

  const handleJoinKitchenContinue = () => {
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      showAppInfo('Enter an invite code to join a kitchen.');
      return;
    }
    if (kitchen?.invite_code === code) {
      showAppInfo('You are already in this kitchen.');
      return;
    }
    if (kitchen) {
      setJoinKitchenSheetStep('confirm');
      return;
    }
    void performJoinKitchen(code);
  };

  const handleJoinKitchenConfirm = () => {
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) return;
    void performJoinKitchen(code);
  };

  const joinKitchenSwitchMessage = kitchen && (kitchen.member_count ?? 1) <= 1
    ? 'Your current kitchen and all its inventory will be permanently removed. You will join the new kitchen and share its inventory.'
    : 'You will leave your current kitchen. Other members keep the shared inventory there.';

  const handleCopyInviteCode = async () => {
    if (!kitchen?.invite_code) return;
    try {
      await copyToClipboard(kitchen.invite_code);
      showAppSuccess('Invite code copied');
    } catch {
      showAppError('Could not copy invite code');
    }
  };

  const handleLeaveAndCreateKitchen = async () => {
    setConfirmDialog({
      title: 'Leave current kitchen?',
      message: 'You will leave this shared kitchen and move to a new personal kitchen.',
      confirmLabel: 'Leave & Create',
      destructive: true,
      icon: 'home-plus',
      onConfirm: async () => {
        setLeavingKitchen(true);
        try {
          await api.leaveKitchen();
          await loadKitchen();
          setInviteCodeInput('');
          closeJoinKitchenSheet();
          showAppSuccess('Created a new personal kitchen.');
        } finally {
          setLeavingKitchen(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerRow}>
          <IconButton
            icon="arrow-left"
            iconColor="#fff"
            size={22}
            onPress={closeProfile}
            style={styles.headerBack}
          />
          <View style={styles.headerLeft}>
            {user?.picture_url ? (
              <Image source={{ uri: user.picture_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{user?.name?.[0] || '?'}</Text>
              </View>
            )}
            <View style={styles.headerText}>
              <Text variant="titleMedium" style={styles.userName} numberOfLines={1}>
                {user?.name}
              </Text>
              <Text variant="bodySmall" style={styles.userEmail} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          </View>
          <ProfileHeaderUpgrade
            entitlements={entitlements}
            planLabel={planLabel()}
            onPress={openProfileUpgrade}
          />
        </View>
        <View style={styles.statRow}>
          <Surface style={styles.statPill} elevation={0}>
            <Text style={styles.statNum}>{profile?.inventory_count || 0}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </Surface>
          <Surface style={styles.statPill} elevation={0}>
            <Text style={[styles.statNum, { color: '#FF9800' }]}>{profile?.expiring_count || 0}</Text>
            <Text style={styles.statLabel}>Expiring</Text>
          </Surface>
          <Surface style={styles.statPill} elevation={0}>
            <Text style={[styles.statNum, { color: '#A5D6A7' }]}>{profile?.memories?.length || 0}</Text>
            <Text style={styles.statLabel}>Memories</Text>
          </Surface>
        </View>
      </View>

      {/* Tabs */}
      <SegmentedButtons
        value={activeTab}
        onValueChange={setActiveTab}
        buttons={[
          { value: 'settings', label: 'Settings' },
          { value: 'preferences', label: 'Preferences' },
          { value: 'memory', label: 'Memory' },
        ]}
        style={styles.tabs}
      />

      {/* ── PREFERENCES ─────────────────────────────────── */}
      {activeTab === 'preferences' && (
        <View style={styles.tabContent}>
          {/* Household */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Household Size</Text>
            <View style={styles.counterRow}>
              <Pressable onPress={() => setHouseholdSize(Math.max(1, householdSize - 1))} style={styles.counterBtn}>
                <IconButton icon="minus" size={18} iconColor="#666" style={{ margin: 0 }} />
              </Pressable>
              <Text variant="headlineMedium" style={styles.counterVal}>{householdSize}</Text>
              <Pressable onPress={() => setHouseholdSize(householdSize + 1)} style={styles.counterBtn}>
                <IconButton icon="plus" size={18} iconColor="#666" style={{ margin: 0 }} />
              </Pressable>
            </View>
          </Surface>

          {/* Spice */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Spice Level</Text>
            <View style={styles.chipRow}>
              {SPICE_LEVELS.map(level => (
                <Pressable key={level} onPress={() => setSpiceLevel(level)}>
                  <Surface style={[styles.optionPill, spiceLevel === level && styles.optionActive]} elevation={0}>
                    <Text style={styles.optionEmoji}>{SPICE_EMOJI[level]}</Text>
                    <Text style={[styles.optionText, spiceLevel === level && styles.optionTextActive]}>
                      {level === 'extra_spicy' ? 'Extra Spicy' : level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Surface>
                </Pressable>
              ))}
            </View>
          </Surface>

          {/* Cooking Skill */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Cooking Skill</Text>
            <View style={styles.chipRow}>
              {COOKING_SKILLS.map(skill => (
                <Pressable key={skill} onPress={() => setCookingSkill(skill)}>
                  <Surface style={[styles.optionPill, cookingSkill === skill && styles.optionActive]} elevation={0}>
                    <Text style={[styles.optionText, cookingSkill === skill && styles.optionTextActive]}>
                      {skill.charAt(0).toUpperCase() + skill.slice(1)}
                    </Text>
                  </Surface>
                </Pressable>
              ))}
            </View>
          </Surface>

          {/* Dietary */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Dietary Preferences</Text>
            <View style={styles.chipRow}>
              {DIETARY_OPTIONS.map(tag => (
                <Chip
                  key={tag}
                  selected={dietaryTags.includes(tag)}
                  onPress={() => toggleChip(tag, dietaryTags, setDietaryTags)}
                  style={[styles.selChip, dietaryTags.includes(tag) && styles.selChipActive]}
                  textStyle={dietaryTags.includes(tag) ? styles.selChipTextActive : styles.selChipText}
                  showSelectedCheck={false}
                >
                  {tag}
                </Chip>
              ))}
            </View>
          </Surface>

          {/* Cuisines */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Favorite Cuisines</Text>
            <View style={styles.chipRow}>
              {CUISINE_OPTIONS.map(cuisine => (
                <Chip
                  key={cuisine}
                  selected={favCuisines.includes(cuisine)}
                  onPress={() => toggleChip(cuisine, favCuisines, setFavCuisines)}
                  style={[styles.selChip, favCuisines.includes(cuisine) && styles.selChipActive]}
                  textStyle={favCuisines.includes(cuisine) ? styles.selChipTextActive : styles.selChipText}
                  showSelectedCheck={false}
                >
                  {cuisine}
                </Chip>
              ))}
            </View>
          </Surface>

          {/* Allergies */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Allergies</Text>
            <View style={styles.chipRow}>
              {allergies.map(a => (
                <Chip key={a} onClose={() => setAllergies(allergies.filter(x => x !== a))} style={styles.grayChip}>
                  {a}
                </Chip>
              ))}
            </View>
            <View style={styles.addRow}>
              <TextInput
                dense mode="outlined" placeholder="Add allergy (e.g. peanuts)"
                value={newAllergy} onChangeText={setNewAllergy} style={styles.addInput}
                outlineColor="#E0E0E0" outlineStyle={{ borderRadius: 12 }}
                onSubmitEditing={() => addCustomItem(newAllergy, allergies, setAllergies, () => setNewAllergy(''))}
              />
              <IconButton icon="plus-circle" iconColor="#888" size={28} onPress={() => addCustomItem(newAllergy, allergies, setAllergies, () => setNewAllergy(''))} style={{ margin: 0 }} />
            </View>
          </Surface>

          {/* Dislikes */}
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Dislikes</Text>
            <View style={styles.chipRow}>
              {dislikes.map(d => (
                <Chip key={d} onClose={() => setDislikes(dislikes.filter(x => x !== d))} style={styles.grayChip}>
                  {d}
                </Chip>
              ))}
            </View>
            <View style={styles.addRow}>
              <TextInput
                dense mode="outlined" placeholder="Add dislike (e.g. bitter gourd)"
                value={newDislike} onChangeText={setNewDislike} style={styles.addInput}
                outlineColor="#E0E0E0" outlineStyle={{ borderRadius: 12 }}
                onSubmitEditing={() => addCustomItem(newDislike, dislikes, setDislikes, () => setNewDislike(''))}
              />
              <IconButton icon="plus-circle" iconColor="#888" size={28} onPress={() => addCustomItem(newDislike, dislikes, setDislikes, () => setNewDislike(''))} style={{ margin: 0 }} />
            </View>
          </Surface>

          <Button mode="contained" onPress={handleSave} loading={saving} style={styles.saveBtn} contentStyle={{ paddingVertical: 4 }}>
            Save Preferences
          </Button>
        </View>
      )}

      {/* ── MEMORY ───────────────────────────────────────── */}
      {activeTab === 'memory' && (
        <View style={styles.tabContent}>
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Add a Memory</Text>
            <Text variant="bodySmall" style={styles.hint}>
              Tell us things like "My kid doesn't eat spicy food", "We love Sunday biryani". These notes personalize meal suggestions.
            </Text>
            <View style={styles.chipRow}>
              {MEMORY_CATEGORIES.map(cat => (
                <Pressable key={cat.value} onPress={() => setMemoryCategory(cat.value)}>
                  <Surface style={[styles.optionPill, memoryCategory === cat.value && styles.optionActive]} elevation={0}>
                    <IconButton icon={cat.icon} size={14} iconColor={memoryCategory === cat.value ? '#fff' : '#888'} style={{ margin: 0 }} />
                    <Text style={[styles.optionText, memoryCategory === cat.value && styles.optionTextActive]}>{cat.label}</Text>
                  </Surface>
                </Pressable>
              ))}
            </View>
            <TextInput
              mode="outlined" placeholder="e.g. My daughter is allergic to cashews"
              value={memoryContent} onChangeText={setMemoryContent}
              multiline numberOfLines={3} style={styles.memInput}
              outlineColor="#E0E0E0" activeOutlineColor="#2E7D32" outlineStyle={{ borderRadius: 12 }}
            />
            <Button mode="contained" onPress={handleAddMemory} loading={addingMemory} disabled={!memoryContent.trim()} style={styles.addMemBtn}>
              Add Memory
            </Button>
          </Surface>

          <Text variant="titleSmall" style={styles.memListTitle}>Your Memories ({profile?.memories?.length || 0})</Text>

          {(!profile?.memories || profile.memories.length === 0) ? (
            <Surface style={styles.emptyMem} elevation={1}>
              <IconButton icon="brain" iconColor="#ccc" size={40} style={{ margin: 0 }} />
              <Text variant="bodyMedium" style={styles.emptyMemText}>
                No memories yet. Add notes about your family's food habits to get better suggestions.
              </Text>
            </Surface>
          ) : (
            profile.memories.map((memory: UserMemory) => (
              <Surface key={memory.id} style={styles.memCard} elevation={1}>
                <View style={styles.memHeader}>
                  <Chip compact style={styles.memCatChip} textStyle={{ fontSize: 11 }}>{memory.category}</Chip>
                  <IconButton icon="close" size={16} iconColor="#ccc" onPress={() => handleDeleteMemory(memory)} style={{ margin: 0 }} />
                </View>
                <Text variant="bodyMedium" style={styles.memText}>{memory.content}</Text>
                <Text variant="bodySmall" style={styles.memDate}>{new Date(memory.created_at).toLocaleDateString()}</Text>
              </Surface>
            ))
          )}
        </View>
      )}

      {/* ── SETTINGS ─────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <View style={styles.tabContent}>
          <ProfilePlanSettingsSection
            entitlements={entitlements}
            planLabel={planLabel()}
            onOpenUpgrade={openProfileUpgrade}
            onSyncPayment={() => void syncLastPayment()}
            busy={upgradeBusy}
            busyPlanKey={upgradeBusyPlanKey}
            loading={entitlementsLoading}
            loadError={entitlementsError}
            onRetry={() => void refreshEntitlements()}
          />

          {isMealLogNotificationSupported() ? (
            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secTitle}>Meal log reminders</Text>
              <Text variant="bodySmall" style={styles.reminderHint}>
                Local notifications only — we ask you to log what you ate. No promos or other alerts.
              </Text>
              <View style={styles.settRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text variant="bodyMedium" style={styles.settLabel}>Daily reminders</Text>
                  <Text variant="bodySmall" style={styles.reminderSub}>
                    1:30 PM & 8:00 PM · opens meal log when tapped
                  </Text>
                </View>
                <Switch
                  value={mealLogReminders}
                  onValueChange={(v) => void onToggleMealLogReminders(v)}
                  disabled={mealLogRemindersLoading}
                  color="#2E7D32"
                />
              </View>
            </Surface>
          ) : null}

          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Shared Kitchen</Text>
            {kitchenLoading ? (
              <ActivityIndicator size="small" />
            ) : kitchen ? (
              <>
                <View style={styles.settRow}>
                  <Text variant="bodyMedium" style={styles.settLabel}>Kitchen name</Text>
                  <Text variant="bodyMedium" style={styles.settVal}>{kitchen.name}</Text>
                </View>
                <Divider style={styles.settDivider} />
                <View style={styles.settRow}>
                  <Text variant="bodyMedium" style={styles.settLabel}>Invite code</Text>
                  <Chip
                    compact
                    icon="content-copy"
                    style={styles.inviteChip}
                    onPress={() => void handleCopyInviteCode()}
                    accessibilityLabel="Copy invite code"
                  >
                    {kitchen.invite_code}
                  </Chip>
                </View>
                <View style={styles.kitchenActionRow}>
                  <Button
                    mode="outlined"
                    onPress={openJoinKitchenSheet}
                    style={[
                      styles.kitchenBtn,
                      (kitchen.member_count ?? 1) > 1 ? styles.kitchenActionBtn : styles.kitchenActionBtnFull,
                    ]}
                    disabled={leavingKitchen || joiningKitchen}
                  >
                    Join another kitchen
                  </Button>
                  {(kitchen.member_count ?? 1) > 1 ? (
                    <Button
                      mode="outlined"
                      onPress={() => void handleLeaveAndCreateKitchen()}
                      loading={leavingKitchen}
                      disabled={leavingKitchen || joiningKitchen}
                      style={[styles.kitchenBtn, styles.kitchenActionBtn]}
                    >
                      Leave + create new
                    </Button>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <Text variant="bodySmall" style={styles.reminderHint}>
                  Create a kitchen or join one using an invite code. All members can add, edit, and delete inventory items.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Kitchen name"
                  value={kitchenName}
                  onChangeText={setKitchenName}
                  style={styles.kitchenInput}
                  outlineColor="#E0E0E0"
                  activeOutlineColor="#2E7D32"
                />
                <Button
                  mode="contained"
                  onPress={() => void handleCreateKitchen()}
                  loading={creatingKitchen}
                  disabled={creatingKitchen}
                  style={styles.kitchenBtn}
                >
                  Create Kitchen
                </Button>
                <Divider style={{ marginVertical: 10 }} />
                <TextInput
                  mode="outlined"
                  label="Invite code"
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  autoCapitalize="characters"
                  style={styles.kitchenInput}
                  outlineColor="#E0E0E0"
                  activeOutlineColor="#2E7D32"
                />
                <Button
                  mode="outlined"
                  onPress={() => void handleJoinKitchenContinue()}
                  loading={joiningKitchen}
                  disabled={joiningKitchen}
                  style={styles.kitchenBtn}
                >
                  Join with Code
                </Button>
              </>
            )}
          </Surface>

          <Surface style={styles.section} elevation={1}>
            <Text variant="titleSmall" style={styles.secTitle}>Account</Text>
            <View style={styles.settRow}>
              <Text variant="bodyMedium" style={styles.settLabel}>Name</Text>
              <Text variant="bodyMedium" style={styles.settVal}>{user?.name}</Text>
            </View>
            <Divider style={styles.settDivider} />
            <View style={styles.settRow}>
              <Text variant="bodyMedium" style={styles.settLabel}>Email</Text>
              <Text variant="bodyMedium" style={styles.settVal}>{user?.email}</Text>
            </View>
            <Divider style={styles.settDivider} />
            <View style={styles.settRow}>
              <Text variant="bodyMedium" style={styles.settLabel}>Provider</Text>
              <Chip compact icon="google" style={{ backgroundColor: '#E3F2FD' }} textStyle={{ fontSize: 12 }}>Google</Chip>
            </View>
          </Surface>

          <AppUpdateSection />

          <Button mode="contained" onPress={handleSignOut} style={styles.signOutBtn} buttonColor="#F44336" contentStyle={{ paddingVertical: 4 }}>
            Sign Out
          </Button>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>

    <AppConfirmDialog
      visible={confirmDialog != null}
      title={confirmDialog?.title ?? ''}
      message={confirmDialog?.message ?? ''}
      confirmLabel={confirmDialog?.confirmLabel}
      destructive={confirmDialog?.destructive}
      icon={confirmDialog?.icon}
      loading={confirmLoading}
      onDismiss={() => !confirmLoading && setConfirmDialog(null)}
      onConfirm={() => void handleConfirmDialog()}
    />
    <BottomSheet
      visible={joinKitchenSheetVisible}
      onDismiss={closeJoinKitchenSheet}
      title={joinKitchenSheetStep === 'confirm' ? 'Switch kitchen?' : 'Join Another Kitchen'}
      subtitle={
        joinKitchenSheetStep === 'confirm'
          ? undefined
          : 'Enter invite code to switch to another kitchen.'
      }
      dismissDisabled={joiningKitchen}
    >
      {joinKitchenSheetStep === 'enter' ? (
        <>
          <TextInput
            mode="outlined"
            label="Invite code"
            value={inviteCodeInput}
            onChangeText={setInviteCodeInput}
            autoCapitalize="characters"
            style={styles.kitchenInput}
            outlineColor="#E0E0E0"
            activeOutlineColor="#2E7D32"
          />
          <Button
            mode="contained"
            onPress={handleJoinKitchenContinue}
            disabled={joiningKitchen}
            style={bottomSheetPrimaryBtn.button}
            contentStyle={bottomSheetPrimaryBtn.content}
            labelStyle={bottomSheetPrimaryBtn.label}
          >
            Continue
          </Button>
        </>
      ) : (
        <>
          <Text variant="bodyMedium" style={styles.joinKitchenConfirmText}>
            {joinKitchenSwitchMessage}
          </Text>
          <Text variant="bodySmall" style={styles.joinKitchenConfirmCode}>
            Joining with code: {inviteCodeInput.trim().toUpperCase()}
          </Text>
          <Button
            mode="contained"
            onPress={() => void handleJoinKitchenConfirm()}
            loading={joiningKitchen}
            disabled={joiningKitchen}
            buttonColor="#C62828"
            style={bottomSheetPrimaryBtn.button}
            contentStyle={bottomSheetPrimaryBtn.content}
            labelStyle={bottomSheetPrimaryBtn.label}
          >
            Switch kitchen
          </Button>
          <Button
            mode="outlined"
            onPress={() => setJoinKitchenSheetStep('enter')}
            disabled={joiningKitchen}
            style={styles.kitchenBtn}
          >
            Back
          </Button>
        </>
      )}
    </BottomSheet>

    <Snackbar
      visible={snackVisible}
      onDismiss={() => {
        setSnackVisible(false);
        snackUndoRef.current = null;
      }}
      duration={MEMORY_DELETE_UNDO_MS}
      wrapperStyle={[snackbarLayoutStyles.host, { marginBottom: insets.bottom + 16 }]}
      style={snackbarLayoutStyles.surface}
      contentStyle={snackbarLayoutStyles.paperContent}
      action={
        snackUndoRef.current
          ? {
              label: 'Undo',
              onPress: () => {
                const undo = snackUndoRef.current;
                snackUndoRef.current = null;
                setSnackVisible(false);
                if (undo) void undo().catch(() => showAppError('Could not undo.'));
              },
            }
          : { label: 'OK', onPress: () => setSnackVisible(false) }
      }
    >
      {snackMsg}
    </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scrollContent: { paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerBack: {
    margin: 0,
    marginLeft: -8,
    marginRight: -4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 12,
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  avatarFallback: { backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 26, color: '#fff', fontWeight: '700' },
  userName: { color: '#fff', fontWeight: '800' },
  userEmail: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 18, justifyContent: 'center' },
  statPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
  },
  statNum: { color: '#fff', fontWeight: '800', fontSize: 18 },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 },

  tabs: { marginHorizontal: 20, marginTop: 16, marginBottom: 4 },
  tabContent: { paddingHorizontal: 20, paddingTop: 8 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  secTitle: { fontWeight: '700', color: '#333', marginBottom: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },

  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  optionActive: { backgroundColor: '#2E7D32' },
  optionEmoji: { fontSize: 14 },
  optionText: { fontSize: 13, color: '#666', fontWeight: '600' },
  optionTextActive: { color: '#fff' },

  selChip: { backgroundColor: '#F5F5F5' },
  selChipActive: { backgroundColor: '#2E7D32' },
  selChipText: { color: '#666' },
  selChipTextActive: { color: '#fff' },

  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  counterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  counterVal: { fontWeight: '800', minWidth: 40, textAlign: 'center', color: '#333' },

  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  addInput: { flex: 1, marginRight: 4, backgroundColor: '#fff' },

  grayChip: { backgroundColor: '#F5F5F5' },

  saveBtn: { borderRadius: 14, marginTop: 4, marginBottom: 16, backgroundColor: '#2E7D32' },

  hint: { color: '#888', marginBottom: 12, lineHeight: 18 },
  memInput: { marginTop: 8, marginBottom: 12, backgroundColor: '#fff' },
  addMemBtn: { backgroundColor: '#2E7D32', borderRadius: 12 },
  memListTitle: { fontWeight: '700', color: '#555', marginTop: 12, marginBottom: 10 },
  emptyMem: { borderRadius: 18, backgroundColor: '#fff', padding: 28, alignItems: 'center' },
  emptyMemText: { textAlign: 'center', color: '#888', marginTop: 8, lineHeight: 20 },
  memCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8 },
  memHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  memCatChip: { backgroundColor: '#E8F5E9' },
  memText: { color: '#333', lineHeight: 20 },
  memDate: { color: '#bbb', marginTop: 6 },

  settRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  settLabel: { color: '#888' },
  settVal: { color: '#555', fontWeight: '500' },
  settDivider: { marginVertical: 2 },
  reminderHint: { color: '#666', marginBottom: 12, lineHeight: 18 },
  reminderSub: { color: '#888', marginTop: 2 },
  inviteChip: { backgroundColor: '#E8F5E9' },
  kitchenInput: { marginBottom: 10, backgroundColor: '#fff' },
  joinKitchenConfirmText: { color: '#424242', lineHeight: 22, marginBottom: 8 },
  joinKitchenConfirmCode: { color: '#757575', marginBottom: 16 },
  kitchenBtn: { borderRadius: 12, marginBottom: 4 },
  kitchenActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kitchenActionBtn: { flex: 1 },
  kitchenActionBtnFull: { flex: 1, width: '100%' },
  signOutBtn: { borderRadius: 14, marginTop: 8 },
});
