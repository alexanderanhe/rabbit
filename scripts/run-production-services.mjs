import { spawnSync } from "node:child_process";

const result = spawnSync(
  "bash",
  ["scripts/sync-production-services.sh", ...process.argv.slice(2)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Unable to synchronize production services: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
