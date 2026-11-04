// node-pty ships a prebuilt `spawn-helper` that must be executable; its own
// install script (which normally does this) is blocked by npm's allow-scripts policy.
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "node_modules", "node-pty", "prebuilds");
if (existsSync(dir)) {
  for (const platform of readdirSync(dir)) {
    const helper = join(dir, platform, "spawn-helper");
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
