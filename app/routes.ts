import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("_health", "routes/health.ts"),
  index("routes/home.tsx"),
  route("timer/:timerId", "routes/timer.tsx"),
  route("account", "routes/account.tsx"),
  route("logout", "routes/logout.tsx"),
  route("api/push/config", "routes/api.push-config.ts"),
  route("api/timers", "routes/api.timers.ts"),
  route("api/timers/:timerId", "routes/api.timer.ts"),
  route("api/account/claim", "routes/api.account-claim.ts"),
] satisfies RouteConfig;
