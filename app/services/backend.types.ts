export type PushSubscriptionData = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { auth: string; p256dh: string };
};

export type RemoteTimerPayload = {
  id: string;
  token: string;
  title: string;
  duration: number;
  endAt: number;
  subscription: PushSubscriptionData;
};
