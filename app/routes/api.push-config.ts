import { data } from "react-router";

export function loader() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return data({ enabled: false }, { status: 503 });
  return { enabled: true, publicKey };
}
