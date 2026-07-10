#!/usr/bin/env node
/**
 * Prevent `next build` from corrupting a running dev server cache.
 */
import { execSync } from "node:child_process";

for (const port of [3000, 3001, 3002]) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim();
    if (!pids) continue;
    console.error(
      `\nBuild blocked: a dev server is listening on port ${port} (pid ${pids.replace(/\n/g, ", ")}).`
    );
    console.error("Stop it first (Ctrl+C in the dev terminal, or npm run reset).\n");
    console.error("Dev and production use separate cache dirs (.next-dev vs .next),");
    console.error("but running both at once still wastes memory and can cause flaky errors.\n");
    process.exit(1);
  } catch {
    // port free
  }
}
