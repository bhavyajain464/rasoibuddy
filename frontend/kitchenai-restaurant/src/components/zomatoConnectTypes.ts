export type ConnectSession = {
  token: string;
  login_url: string;
  connect_url: string;
  expires_at: string;
};

export type ZomatoConnectModalProps = {
  visible: boolean;
  kitchenId: string;
  onClose: () => void;
  onConnected: () => void;
};
