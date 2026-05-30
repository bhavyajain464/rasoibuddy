import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Inventory: { tab?: 'all' | 'expired'; expiringSoon?: boolean };
  Meals: {
    openLog?: boolean;
    generateCategory?: string;
    mealType?: string;
  } | undefined;
  Cook: { dishItems?: string[] } | undefined;
  Shopping: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Profile: { upgradePlan?: boolean } | undefined;
};
