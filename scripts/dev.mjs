#!/usr/bin/env node
/**
 * Stable dev startup: stop duplicate servers, warn about ~/package-lock.json,
 * then start Next.js (uses .next-dev via next.config.ts — never collides with build).
 */
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

const homeLock = join(homedir(), "package-lock.json");
if (existsSync(homeLock)) {
  console.warn(
    "\n⚠  ~/package-lock.json exists — Next.js may pick the wrong workspace root."
  );
  console.warn("   This project pins its root in next.config.ts, but for best results:");
  console.warn("   mv ~/package-lock.json ~/package-lock.json.bak\n");
}

const nextBin = join(projectRoot, "node_modules", ".bin", "next");
const child = spawn(nextBin, ["dev"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

child.on("exit", (code) => process.exit(code ?? 0));
