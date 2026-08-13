import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("timer/:timerId", "routes/timer.tsx"),
  route("api/push/config", "routes/api.push-config.ts"),
  route("api/timers", "routes/api.timers.ts"),
  route("api/timers/:timerId", "routes/api.timer.ts"),
] satisfies RouteConfig;
