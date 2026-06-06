export type MainTabParamList = {
  Home: undefined;
  Orders: undefined;
  Menu: undefined;
  Stock: undefined;
  Buy: undefined;
};

export type RootStackParamList = {
  Main: undefined | { screen?: keyof MainTabParamList };
  Profile: undefined;
};
