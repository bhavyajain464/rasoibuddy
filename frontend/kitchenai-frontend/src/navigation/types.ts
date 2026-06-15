import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Inventory: { tab?: 'all' | 'expired'; expiringSoon?: boolean };
  Meals: {
    openLog?: boolean;
    generateCategory?: string;
    mealType?: string;
    /** Opens the week-plan day sheet for this date (YYYY-MM-DD). */
    openWeekPlanDate?: string;
    /** When set, in-category Back returns to this tab (e.g. Home → Meal of Day → Back). */
    returnToTab?: 'Home';
  } | undefined;
  Cook: { dishItems?: string[] } | undefined;
  Shopping: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Profile: { upgradePlan?: boolean } | undefined;
};

export type PublicStackParamList = {
  Landing: undefined;
  Login: undefined;
};
