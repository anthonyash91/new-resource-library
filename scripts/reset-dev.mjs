#!/usr/bin/env node
/**
 * Stop stale Next.js dev servers and remove dev/build caches.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];

for (const port of PORTS) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, {
      stdio: "ignore",
      shell: "/bin/bash",
    });
  } catch {
    // nothing listening
  }
}

for (const dir of [".next-dev", ".next"]) {
  rmSync(join(projectRoot, dir), { recursive: true, force: true });
}

console.log("Stopped dev servers and removed .next-dev/ + .next/");
console.log("Starting dev…\n");

execSync("node scripts/dev.mjs", { cwd: projectRoot, stdio: "inherit" });
