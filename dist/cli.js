#!/usr/bin/env bun
// @bun
var __defProp = Object.defineProperty;
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/config-service.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      return parsed;
  }
  return fallback;
}
function normalizeConfig(raw) {
  if (!isRecord(raw))
    return null;
  const config = raw;
  const codex = isRecord(config.codex) ? config.codex : {};
  const daemon = isRecord(config.daemon) ? config.daemon : {};
  const turnCoordination = isRecord(config.turnCoordination) ? config.turnCoordination : {};
  return {
    version: typeof config.version === "string" ? config.version : DEFAULT_CONFIG.version,
    codex: {
      appPort: normalizeInteger(codex.appPort ?? daemon.port, DEFAULT_CONFIG.codex.appPort),
      proxyPort: normalizeInteger(codex.proxyPort ?? daemon.proxyPort, DEFAULT_CONFIG.codex.proxyPort)
    },
    turnCoordination: {
      attentionWindowSeconds: normalizeInteger(turnCoordination.attentionWindowSeconds, DEFAULT_CONFIG.turnCoordination.attentionWindowSeconds)
    },
    idleShutdownSeconds: normalizeInteger(config.idleShutdownSeconds, DEFAULT_CONFIG.idleShutdownSeconds)
  };
}

class ConfigService {
  configDir;
  configPath;
  constructor(projectRoot) {
    const root = projectRoot ?? process.cwd();
    this.configDir = join(root, CONFIG_DIR);
    this.configPath = join(this.configDir, CONFIG_FILE);
  }
  hasConfig() {
    return existsSync(this.configPath);
  }
  load() {
    try {
      const raw = readFileSync(this.configPath, "utf-8");
      return normalizeConfig(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  loadOrDefault() {
    return this.load() ?? structuredClone(DEFAULT_CONFIG);
  }
  save(config) {
    this.ensureConfigDir();
    writeFileSync(this.configPath, JSON.stringify(config, null, 2) + `
`, "utf-8");
  }
  initDefaults() {
    this.ensureConfigDir();
    const created = [];
    if (!existsSync(this.configPath)) {
      this.save(DEFAULT_CONFIG);
      created.push(this.configPath);
    }
    return created;
  }
  get configFilePath() {
    return this.configPath;
  }
  ensureConfigDir() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }
}
var DEFAULT_CONFIG, CONFIG_DIR = ".agentbridge", CONFIG_FILE = "config.json";
var init_config_service = __esm(() => {
  DEFAULT_CONFIG = {
    version: "1.0",
    codex: {
      appPort: 4500,
      proxyPort: 4501
    },
    turnCoordination: {
      attentionWindowSeconds: 15
    },
    idleShutdownSeconds: 30
  };
});

// src/cli/pkg-root.ts
import { dirname, join as join2 } from "path";
import { existsSync as existsSync2 } from "fs";
import { execFileSync } from "child_process";
function findPackageRoot() {
  let dir = import.meta.dir;
  while (true) {
    if (existsSync2(join2(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find package.json in any parent directory");
    }
    dir = parent;
  }
}
function registerMarketplace(marketplaceRoot) {
  execFileSync("claude", ["plugin", "marketplace", "add", marketplaceRoot], {
    stdio: "inherit"
  });
}
var init_pkg_root = () => {};

// src/marker-section.ts
function upsertMarkedSection(content, sectionId, section) {
  const startMarker = MARKER_START(sectionId);
  const endMarker = MARKER_END(sectionId);
  const block = `${startMarker}
${section}
${endMarker}`;
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  const hasStart = startIdx !== -1;
  const hasEnd = endIdx !== -1;
  if (hasStart && hasEnd && startIdx < endIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + endMarker.length);
    return before + block + after;
  }
  if (hasStart || hasEnd) {
    throw new Error(`Malformed ${sectionId} markers in file (start=${startIdx}, end=${endIdx}). ` + `Please repair the file manually \u2014 remove the stray marker(s) or restore the pair.`);
  }
  if (content.trim() === "") {
    return block + `
`;
  }
  const trimmed = content.endsWith(`
`) ? content : content + `
`;
  return trimmed + `
` + block + `
`;
}
var MARKER_START = (id) => `<!-- ${id}:start -->`, MARKER_END = (id) => `<!-- ${id}:end -->`;

// src/collaboration-content.ts
var MARKER_ID = "AgentBridge", CLAUDE_MD_SECTION = `## AgentBridge \u2014 Multi-Agent Collaboration

You are working in a **multi-agent environment** powered by AgentBridge.
Another AI agent (Codex, by OpenAI) is available in a parallel session on this machine.

### Communication mechanism
- **Claude \u2192 Codex**: Use the AgentBridge MCP tools (\`reply\` / \`get_messages\`) \u2014 these are yours only.
- **Codex \u2192 Claude**: Codex has no symmetric tool. The bridge transparently intercepts Codex's normal output and forwards it to you. Messages arrive as push notifications (or via \`get_messages\` in pull mode).
- If Codex ever complains it can't find a "send-to-Claude" API, remind it that its side is transparent \u2014 it just writes a reply and you'll see it.

### When to collaborate vs. work solo
- **Collaborate** when the task benefits from a second perspective, parallel execution, or capabilities you lack (e.g., sandboxed code execution, independent verification).
- **Work solo** for simple, self-contained tasks where the coordination overhead isn't worth it.
- When in doubt, **propose a task split** to Codex rather than doing everything yourself.

### Capability comparison
| Capability | Claude (you) | Codex |
|---|---|---|
| Architecture & planning | Strong | Moderate |
| Code review & analysis | Strong | Strong |
| Sandboxed code execution | No | Yes |
| File editing & refactoring | Yes (via tools) | Yes (via sandbox) |
| Web search & docs | Yes | Limited |
| Independent verification | Cross-review | Reproduce & test |

### How to start collaborating
1. When you receive a complex task, **proactively propose a division of labor** to Codex via the reply tool.
2. State what you'll handle and what you'd like Codex to take on.
3. Ask for Codex's agreement or counter-proposal before proceeding.
4. After task completion, **cross-review** each other's work.`, AGENTS_MD_SECTION = `## AgentBridge \u2014 Multi-Agent Collaboration

You are working in a **multi-agent environment** powered by AgentBridge.
Another AI agent (Claude, by Anthropic) is available in a parallel session on this machine.

### Communication mechanism (read this first)
AgentBridge is a **transparent proxy** on your side. You do **not** have a tool to "send a message to Claude".

- **Codex \u2192 Claude**: Just write your normal response. The bridge intercepts your \`agentMessage\` output and forwards it to Claude automatically. No tool call needed.
- **Claude \u2192 Codex**: Claude uses its own MCP tools (\`reply\` / \`get_messages\`). Those messages arrive in your session as new user turns \u2014 you'll see them like any other user input.

**Do not** search the AgentBridge source for a Codex-side "send" / "reply" / "sendToClaude" API \u2014 it does not exist, and looking for it wastes turns. If you catch yourself thinking "I need to find how to message Claude", stop and just write your reply as normal text.

### When to collaborate vs. work solo
- **Collaborate** when the task benefits from a second perspective, parallel execution, or capabilities the other agent has.
- **Work solo** for simple, self-contained tasks where the coordination overhead isn't worth it.
- When in doubt, **propose a task split** to Claude rather than doing everything yourself.

### Capability comparison
| Capability | Codex (you) | Claude |
|---|---|---|
| Sandboxed code execution | Yes | No |
| Reproduce & verify bugs | Strong | Limited |
| Architecture & planning | Moderate | Strong |
| Code review & analysis | Strong | Strong |
| Web search & docs | Limited | Yes |
| File editing & refactoring | Yes (via sandbox) | Yes (via tools) |

### How to start collaborating
1. When you receive a complex task, **proactively propose a division of labor** in your response (Claude will receive it).
2. State what you'll handle and what you'd like Claude to take on.
3. Ask for Claude's agreement or counter-proposal before proceeding.
4. After task completion, **cross-review** each other's work.`;

// src/cli/init.ts
var exports_init = {};
__export(exports_init, {
  writeCollaborationSections: () => writeCollaborationSections,
  runInit: () => runInit,
  compareVersions: () => compareVersions
});
import { execSync, execFileSync as execFileSync2 } from "child_process";
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
async function runInit() {
  console.log(`AgentBridge Init
`);
  console.log("Checking dependencies...");
  checkBun();
  checkClaude();
  checkCodex();
  console.log("");
  console.log("Generating project config...");
  const configService = new ConfigService;
  const created = configService.initDefaults();
  if (created.length > 0) {
    for (const file of created) {
      console.log(`  Created: ${file}`);
    }
  } else {
    console.log("  Project config already exists, skipping.");
  }
  console.log("");
  console.log("Writing collaboration sections...");
  const projectRoot = process.cwd();
  const collabResults = writeCollaborationSections(projectRoot);
  for (const result of collabResults) {
    console.log(`  ${result}`);
  }
  console.log("");
  console.log("Installing AgentBridge plugin...");
  try {
    registerMarketplace(findPackageRoot());
    execFileSync2("claude", ["plugin", "install", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`], {
      stdio: "inherit"
    });
    console.log("  Plugin installed successfully.");
  } catch {
    console.log("  Plugin install skipped (marketplace registration or install failed).");
    console.log("  You can install it later with:");
    console.log(`    abg dev   # registers marketplace and installs plugin`);
  }
  console.log("");
  console.log(`Setup complete!
`);
  console.log("Next steps:");
  console.log("  1. If Claude Code is already running, execute /reload-plugins in your session");
  console.log("  2. Start Claude Code:  agentbridge claude");
  console.log("  3. Start Codex TUI:    agentbridge codex");
}
function checkBun() {
  try {
    const version = execSync("bun --version", { encoding: "utf-8" }).trim();
    console.log(`  bun: ${version}`);
  } catch {
    console.error("  ERROR: bun not found in PATH.");
    console.error("  Install Bun: https://bun.sh");
    process.exit(1);
  }
}
function checkClaude() {
  try {
    const versionOutput = execSync("claude --version", { encoding: "utf-8" }).trim();
    const match = versionOutput.match(/(\d+\.\d+\.\d+)/);
    if (match) {
      const version = match[1];
      console.log(`  claude: ${version}`);
      if (compareVersions(version, MIN_CLAUDE_VERSION) < 0) {
        console.error(`  ERROR: Claude Code version ${version} is too old.`);
        console.error(`  Channels require >= ${MIN_CLAUDE_VERSION}.`);
        console.error("  Update: npm update -g @anthropic-ai/claude-code");
        process.exit(1);
      }
    } else {
      console.log(`  claude: ${versionOutput} (version check skipped)`);
    }
  } catch {
    console.error("  ERROR: claude not found in PATH.");
    console.error("  Install Claude Code: npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }
}
function checkCodex() {
  try {
    const version = execSync("codex --version", { encoding: "utf-8" }).trim();
    console.log(`  codex: ${version}`);
  } catch {
    console.error("  ERROR: codex not found in PATH.");
    console.error("  Install Codex: https://github.com/openai/codex");
    process.exit(1);
  }
}
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0;i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb)
      return -1;
    if (va > vb)
      return 1;
  }
  return 0;
}
function writeCollaborationSections(projectRoot) {
  const results = [];
  const files = [
    { name: "CLAUDE.md", path: join3(projectRoot, "CLAUDE.md"), section: CLAUDE_MD_SECTION },
    { name: "AGENTS.md", path: join3(projectRoot, "AGENTS.md"), section: AGENTS_MD_SECTION }
  ];
  for (const { name, path, section } of files) {
    let existing = "";
    try {
      existing = readFileSync2(path, "utf-8");
    } catch {}
    let updated;
    try {
      updated = upsertMarkedSection(existing, MARKER_ID, section);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`${name}: skipped \u2014 ${msg}`);
      continue;
    }
    if (updated === existing) {
      results.push(`${name}: unchanged (section already up to date)`);
      continue;
    }
    writeFileSync2(path, updated, "utf-8");
    if (existing === "") {
      results.push(`${name}: created with collaboration section`);
    } else if (existing.includes(`<!-- ${MARKER_ID}:start -->`)) {
      results.push(`${name}: updated collaboration section`);
    } else {
      results.push(`${name}: appended collaboration section`);
    }
  }
  return results;
}
var MIN_CLAUDE_VERSION = "2.1.80";
var init_init = __esm(() => {
  init_config_service();
  init_cli();
  init_pkg_root();
});

// src/cli/dev.ts
var exports_dev = {};
__export(exports_dev, {
  runDev: () => runDev
});
import { execFileSync as execFileSync3, spawnSync } from "child_process";
import { resolve } from "path";
import { existsSync as existsSync3, cpSync, rmSync } from "fs";
import { homedir } from "os";
async function runDev() {
  console.log(`AgentBridge Dev Setup
`);
  const projectRoot = findPackageRoot();
  const marketplacePath = resolve(projectRoot, ".claude-plugin", "marketplace.json");
  const pluginDir = resolve(projectRoot, "plugins", "agentbridge");
  const pluginManifest = resolve(pluginDir, ".claude-plugin", "plugin.json");
  console.log("Building CLI from source...");
  const cliBuild = spawnSync("bun", ["run", "build:cli"], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (cliBuild.status !== 0) {
    console.error("  ERROR: CLI build failed. Fix build errors and try again.");
    process.exit(1);
  }
  console.log(`  \u2713 CLI built successfully
`);
  console.log("Building plugin from source...");
  const buildResult = spawnSync("bun", ["run", "build:plugin"], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (buildResult.status !== 0) {
    console.error("  ERROR: Plugin build failed. Fix build errors and try again.");
    process.exit(1);
  }
  console.log(`  \u2713 Plugin built successfully
`);
  if (!existsSync3(pluginManifest)) {
    console.error(`  ERROR: Plugin manifest not found at ${pluginManifest}`);
    console.error("  Run 'bun run build:plugin' first, or check your working tree.");
    process.exit(1);
  }
  if (!existsSync3(marketplacePath)) {
    console.error(`  ERROR: Marketplace manifest not found at ${marketplacePath}`);
    process.exit(1);
  }
  console.log(`  Plugin source: ${pluginDir}`);
  console.log(`
Registering local marketplace...`);
  try {
    registerMarketplace(projectRoot);
  } catch (e) {
    console.error(`  ERROR: Failed to register marketplace: ${e.message}`);
    process.exit(1);
  }
  const pluginRef = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
  console.log(`
Installing plugin...`);
  try {
    const listOutput = execFileSync3("claude", ["plugin", "list"], { encoding: "utf-8" });
    if (!listOutput.includes(pluginRef)) {
      execFileSync3("claude", ["plugin", "install", pluginRef], { stdio: "inherit" });
    } else {
      console.log(`  Plugin '${pluginRef}' already installed.`);
    }
  } catch (e) {
    console.error(`  ERROR: Failed to install plugin: ${e.message}`);
    process.exit(1);
  }
  console.log(`
Syncing local plugin to cache...`);
  const cacheDir = resolve(homedir(), ".claude", "plugins", "cache", MARKETPLACE_NAME, PLUGIN_NAME);
  if (existsSync3(cacheDir)) {
    const versionDirs = Bun.spawnSync(["ls", cacheDir]).stdout.toString().trim().split(`
`).filter(Boolean);
    for (const ver of versionDirs) {
      const targetDir = resolve(cacheDir, ver);
      rmSync(targetDir, { recursive: true, force: true });
      cpSync(pluginDir, targetDir, { recursive: true });
      console.log(`  Synced to ${targetDir}`);
    }
  } else {
    console.log("  Cache directory not found, plugin install should have created it.");
  }
  console.log(`
\u2705 Dev setup complete!
`);
  console.log("Next steps:");
  console.log("  agentbridge claude    # Start Claude Code (plugin auto-loaded)");
  console.log("  agentbridge codex     # Start Codex TUI");
  console.log("");
  console.log("Code changed? Run 'agentbridge dev' again, then restart Claude Code or /reload-plugins.");
}
var init_dev = __esm(() => {
  init_cli();
  init_pkg_root();
});

// src/daemon-lifecycle.ts
import { spawn, execFileSync as execFileSync4 } from "child_process";
import { existsSync as existsSync4, readFileSync as readFileSync3, unlinkSync, writeFileSync as writeFileSync3, openSync, closeSync, constants } from "fs";
import { fileURLToPath } from "url";

class DaemonLifecycle {
  stateDir;
  controlPort;
  log;
  constructor(opts) {
    this.stateDir = opts.stateDir;
    this.controlPort = opts.controlPort;
    this.log = opts.log;
  }
  get healthUrl() {
    return `http://127.0.0.1:${this.controlPort}/healthz`;
  }
  get readyUrl() {
    return `http://127.0.0.1:${this.controlPort}/readyz`;
  }
  get controlWsUrl() {
    return `ws://127.0.0.1:${this.controlPort}/ws`;
  }
  async ensureRunning() {
    if (await this.isHealthy()) {
      await this.waitForReady();
      return;
    }
    const existingPid = this.readPid();
    if (existingPid) {
      if (isProcessAlive(existingPid)) {
        if (this.isDaemonProcess(existingPid)) {
          try {
            await this.waitForReady(12, 250);
            return;
          } catch {
            throw new Error(`Found existing daemon process ${existingPid}, but control port ${this.controlPort} never became ready.`);
          }
        }
        this.log(`Pid ${existingPid} is alive but not an AgentBridge daemon, removing stale pid file`);
      }
      this.removeStalePidFile();
    }
    const lockAcquired = this.acquireLock();
    if (!lockAcquired) {
      this.log("Another process is starting the daemon, waiting for readiness...");
      await this.waitForReady();
      return;
    }
    try {
      this.launch();
      await this.waitForReady();
    } finally {
      this.releaseLock();
    }
  }
  async isHealthy() {
    try {
      const response = await fetch(this.healthUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
  async waitForHealthy(maxRetries = 40, delayMs = 250) {
    for (let attempt = 0;attempt < maxRetries; attempt++) {
      if (await this.isHealthy())
        return;
      await new Promise((resolve2) => setTimeout(resolve2, delayMs));
    }
    throw new Error(`Timed out waiting for AgentBridge daemon health on ${this.healthUrl}`);
  }
  async isReady() {
    try {
      const response = await fetch(this.readyUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
  async waitForReady(maxRetries = 40, delayMs = 250) {
    for (let attempt = 0;attempt < maxRetries; attempt++) {
      if (await this.isReady())
        return;
      await new Promise((resolve2) => setTimeout(resolve2, delayMs));
    }
    throw new Error(`Timed out waiting for AgentBridge daemon readiness on ${this.readyUrl}`);
  }
  readStatus() {
    try {
      const raw = readFileSync3(this.stateDir.statusFile, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  writeStatus(status) {
    this.stateDir.ensure();
    writeFileSync3(this.stateDir.statusFile, JSON.stringify(status, null, 2) + `
`, "utf-8");
  }
  readPid() {
    try {
      const raw = readFileSync3(this.stateDir.pidFile, "utf-8").trim();
      if (!raw)
        return null;
      const pid = Number.parseInt(raw, 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  }
  writePid(pid) {
    this.stateDir.ensure();
    writeFileSync3(this.stateDir.pidFile, `${pid ?? process.pid}
`, "utf-8");
  }
  removePidFile() {
    try {
      unlinkSync(this.stateDir.pidFile);
    } catch {}
  }
  removeStatusFile() {
    try {
      unlinkSync(this.stateDir.statusFile);
    } catch {}
  }
  markKilled() {
    this.stateDir.ensure();
    writeFileSync3(this.stateDir.killedFile, `${Date.now()}
`, "utf-8");
  }
  clearKilled() {
    try {
      unlinkSync(this.stateDir.killedFile);
    } catch {}
  }
  wasKilled() {
    return existsSync4(this.stateDir.killedFile);
  }
  launch() {
    this.stateDir.ensure();
    this.log(`Launching detached daemon on control port ${this.controlPort}`);
    const daemonProc = spawn(process.execPath, ["run", DAEMON_PATH], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENTBRIDGE_CONTROL_PORT: String(this.controlPort),
        AGENTBRIDGE_STATE_DIR: this.stateDir.dir
      },
      detached: true,
      stdio: "ignore"
    });
    daemonProc.unref();
  }
  removeStalePidFile() {
    this.log("Removing stale pid file");
    this.removePidFile();
  }
  acquireLock(depth = 0) {
    if (depth > 1) {
      this.log("Lock acquisition failed after retry, proceeding without lock");
      return true;
    }
    this.stateDir.ensure();
    try {
      const fd = openSync(this.stateDir.lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      writeFileSync3(fd, `${process.pid}
`);
      closeSync(fd);
      return true;
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const holderPid = Number.parseInt(readFileSync3(this.stateDir.lockFile, "utf-8").trim(), 10);
          if (Number.isFinite(holderPid) && !isProcessAlive(holderPid)) {
            this.log(`Stale lock file from dead process ${holderPid}, removing`);
            this.releaseLock();
            return this.acquireLock(depth + 1);
          }
        } catch {
          this.log("Cannot read lock file, removing stale lock");
          this.releaseLock();
          return this.acquireLock(depth + 1);
        }
        return false;
      }
      this.log(`Warning: could not acquire startup lock: ${err.message}`);
      return true;
    }
  }
  releaseLock() {
    try {
      unlinkSync(this.stateDir.lockFile);
    } catch {}
  }
  async kill(gracefulTimeoutMs = 3000) {
    const pid = this.readPid();
    if (!pid) {
      this.log("No daemon pid file found");
      this.cleanup();
      return false;
    }
    if (!isProcessAlive(pid)) {
      this.log(`Daemon pid ${pid} is not alive, cleaning up stale files`);
      this.cleanup();
      return false;
    }
    if (!this.isDaemonProcess(pid)) {
      this.log(`Pid ${pid} is alive but is NOT an AgentBridge daemon \u2014 refusing to kill. Cleaning up stale pid file.`);
      this.cleanup();
      return false;
    }
    this.log(`Sending SIGTERM to daemon pid ${pid}`);
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      this.cleanup();
      return false;
    }
    const deadline = Date.now() + gracefulTimeoutMs;
    while (Date.now() < deadline) {
      if (!isProcessAlive(pid)) {
        this.log(`Daemon pid ${pid} stopped gracefully`);
        this.cleanup();
        return true;
      }
      await new Promise((resolve2) => setTimeout(resolve2, 200));
    }
    this.log(`Daemon pid ${pid} did not stop gracefully, sending SIGKILL`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
    this.cleanup();
    return true;
  }
  isDaemonProcess(pid) {
    try {
      const cmd = execFileSync4("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" }).trim();
      return cmd.includes("daemon") && (cmd.includes("agentbridge") || cmd.includes("agent_bridge"));
    } catch {
      return false;
    }
  }
  cleanup() {
    this.removePidFile();
    this.removeStatusFile();
    this.releaseLock();
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var DAEMON_ENTRY, DAEMON_PATH;
var init_daemon_lifecycle = __esm(() => {
  DAEMON_ENTRY = process.env.AGENTBRIDGE_DAEMON_ENTRY ?? "./daemon.ts";
  DAEMON_PATH = fileURLToPath(new URL(DAEMON_ENTRY, import.meta.url));
});

// src/state-dir.ts
import { mkdirSync as mkdirSync2, existsSync as existsSync5 } from "fs";
import { join as join4 } from "path";
import { homedir as homedir2, platform } from "os";

class StateDirResolver {
  stateDir;
  constructor(envOverride) {
    const override = envOverride ?? process.env.AGENTBRIDGE_STATE_DIR;
    if (override) {
      this.stateDir = override;
    } else if (platform() === "darwin") {
      this.stateDir = join4(homedir2(), "Library", "Application Support", "AgentBridge");
    } else {
      const xdgState = process.env.XDG_STATE_HOME ?? join4(homedir2(), ".local", "state");
      this.stateDir = join4(xdgState, "agentbridge");
    }
  }
  ensure() {
    if (!existsSync5(this.stateDir)) {
      mkdirSync2(this.stateDir, { recursive: true });
    }
  }
  get dir() {
    return this.stateDir;
  }
  get pidFile() {
    return join4(this.stateDir, "daemon.pid");
  }
  get tuiPidFile() {
    return join4(this.stateDir, "codex-tui.pid");
  }
  get lockFile() {
    return join4(this.stateDir, "daemon.lock");
  }
  get statusFile() {
    return join4(this.stateDir, "status.json");
  }
  get portsFile() {
    return join4(this.stateDir, "ports.json");
  }
  get logFile() {
    return join4(this.stateDir, "agentbridge.log");
  }
  get codexWrapperLogFile() {
    return join4(this.stateDir, "codex-wrapper.log");
  }
  get killedFile() {
    return join4(this.stateDir, "killed");
  }
}
var init_state_dir = () => {};

// src/cli/claude.ts
var exports_claude = {};
__export(exports_claude, {
  runClaude: () => runClaude,
  checkOwnedFlagConflicts: () => checkOwnedFlagConflicts
});
import { spawn as spawn2 } from "child_process";
async function runClaude(args) {
  checkOwnedFlagConflicts(args, "agentbridge claude", OWNED_FLAGS);
  const stateDir = new StateDirResolver;
  const controlPort = parseInt(process.env.AGENTBRIDGE_CONTROL_PORT ?? "4502", 10);
  const lifecycle = new DaemonLifecycle({
    stateDir,
    controlPort,
    log: (msg) => console.error(`[agentbridge] ${msg}`)
  });
  lifecycle.clearKilled();
  const channelEntry = `plugin:${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
  const fullArgs = [
    "--dangerously-load-development-channels",
    channelEntry,
    ...args
  ];
  const child = spawn2("claude", fullArgs, {
    stdio: "inherit",
    env: process.env
  });
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error("Error: claude not found in PATH.");
      console.error("Install Claude Code: npm install -g @anthropic-ai/claude-code");
      process.exit(1);
    }
    console.error(`Error starting Claude Code: ${err.message}`);
    process.exit(1);
  });
}
function checkOwnedFlagConflicts(args, commandName, ownedFlags) {
  for (const flag of ownedFlags) {
    if (args.some((a) => a === flag || a.startsWith(`${flag}=`))) {
      console.error(`Error: "${flag}" is automatically set by ${commandName}.`);
      console.error("");
      console.error("AgentBridge automatically injects these flags:");
      for (const f of ownedFlags) {
        console.error(`  ${f}`);
      }
      console.error("");
      const nativeCmd = commandName.includes("codex") ? "codex" : "claude";
      console.error("If you need full control over these flags, use the native command directly:");
      console.error(`  ${nativeCmd} [your flags here]`);
      process.exit(1);
    }
  }
}
var OWNED_FLAGS;
var init_claude = __esm(() => {
  init_cli();
  init_daemon_lifecycle();
  init_state_dir();
  OWNED_FLAGS = ["--channels", "--dangerously-load-development-channels"];
});

// src/stderr-ring-buffer.ts
class StderrRingBuffer {
  maxBytes;
  chunks = [];
  bytes = 0;
  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
    if (maxBytes <= 0) {
      throw new Error("StderrRingBuffer maxBytes must be positive");
    }
  }
  append(chunk) {
    if (chunk.length === 0)
      return;
    if (chunk.length >= this.maxBytes) {
      this.chunks = [chunk.subarray(chunk.length - this.maxBytes)];
      this.bytes = this.maxBytes;
      return;
    }
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > this.maxBytes && this.chunks.length > 0) {
      const head = this.chunks[0];
      const overflow = this.bytes - this.maxBytes;
      if (head.length <= overflow) {
        this.chunks.shift();
        this.bytes -= head.length;
      } else {
        this.chunks[0] = head.subarray(overflow);
        this.bytes -= overflow;
      }
    }
  }
  snapshot() {
    return Buffer.concat(this.chunks, this.bytes);
  }
  toString(encoding = "utf-8") {
    return this.snapshot().toString(encoding);
  }
  get byteLength() {
    return this.bytes;
  }
}
var DEFAULT_MAX_BYTES;
var init_stderr_ring_buffer = __esm(() => {
  DEFAULT_MAX_BYTES = 64 * 1024;
});

// src/cli/codex.ts
var exports_codex = {};
__export(exports_codex, {
  runCodex: () => runCodex,
  buildCodexArgs: () => buildCodexArgs
});
import { spawn as spawn3, execSync as execSync2 } from "child_process";
import {
  openSync as openSync2,
  writeSync,
  closeSync as closeSync2,
  writeFileSync as writeFileSync4,
  unlinkSync as unlinkSync2,
  appendFileSync,
  existsSync as existsSync6,
  mkdirSync as mkdirSync3
} from "fs";
import { dirname as dirname2 } from "path";
function appendWrapperLog(path, entry) {
  try {
    const dir = dirname2(path);
    if (!existsSync6(dir)) {
      mkdirSync3(dir, { recursive: true });
    }
    appendFileSync(path, `[${new Date().toISOString()}] ${entry}
`, "utf-8");
  } catch {}
}
function buildChildEnv() {
  return {
    ...process.env,
    RUST_BACKTRACE: process.env.RUST_BACKTRACE ?? "full",
    RUST_LOG: process.env.RUST_LOG ?? "info,codex_core=debug,codex_tui=debug,codex_app_server=debug"
  };
}
function buildCodexArgs(userArgs, proxyUrl) {
  const bridgeFlags = ["--enable", "tui_app_server", "--remote", proxyUrl];
  const first = userArgs[0];
  if (!first || first.startsWith("-")) {
    return { fullArgs: [...bridgeFlags, ...userArgs], injectedBridgeFlags: true };
  }
  if (TUI_SUBCOMMANDS.has(first)) {
    return {
      fullArgs: [first, ...bridgeFlags, ...userArgs.slice(1)],
      injectedBridgeFlags: true
    };
  }
  if (NON_TUI_SUBCOMMANDS.has(first)) {
    return { fullArgs: userArgs, injectedBridgeFlags: false };
  }
  return { fullArgs: [...bridgeFlags, ...userArgs], injectedBridgeFlags: true };
}
async function runCodex(args) {
  checkOwnedFlagConflicts(args, "agentbridge codex", OWNED_FLAGS2);
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--enable" && args[i + 1] === "tui_app_server") {
      console.error(`Error: "--enable tui_app_server" is automatically set by agentbridge codex.`);
      console.error("");
      console.error("If you need full control over these flags, use the native command directly:");
      console.error("  codex [your flags here]");
      process.exit(1);
    }
    if (args[i] === "--enable=tui_app_server") {
      console.error(`Error: "--enable=tui_app_server" is automatically set by agentbridge codex.`);
      console.error("");
      console.error("If you need full control over these flags, use the native command directly:");
      console.error("  codex [your flags here]");
      process.exit(1);
    }
  }
  const stateDir = new StateDirResolver;
  const configService = new ConfigService;
  const config = configService.loadOrDefault();
  const controlPort = parseInt(process.env.AGENTBRIDGE_CONTROL_PORT ?? "4502", 10);
  const lifecycle = new DaemonLifecycle({
    stateDir,
    controlPort,
    log: (msg) => console.error(`[agentbridge] ${msg}`)
  });
  console.error("[agentbridge] Ensuring daemon is running...");
  try {
    lifecycle.clearKilled();
    await lifecycle.ensureRunning();
    console.error("[agentbridge] Daemon is ready.");
  } catch (err) {
    console.error(`[agentbridge] Failed to start daemon: ${err.message}`);
    console.error("[agentbridge] Try: agentbridge kill && agentbridge claude");
    process.exit(1);
  }
  let proxyUrl;
  const status = lifecycle.readStatus();
  if (status?.proxyUrl) {
    proxyUrl = status.proxyUrl;
  } else {
    proxyUrl = `ws://127.0.0.1:${config.codex.proxyPort}`;
    console.error(`[agentbridge] No daemon status found, using config default: ${proxyUrl}`);
  }
  try {
    await waitForProxyReady(proxyUrl);
  } catch (err) {
    console.error(`[agentbridge] ${err.message}`);
    process.exit(1);
  }
  console.log(`Connecting Codex TUI to AgentBridge at ${proxyUrl}...`);
  let savedStty = null;
  if (process.stdin.isTTY) {
    try {
      savedStty = execSync2("stty -g", { encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"] }).trim();
    } catch {}
  }
  function restoreTerminal() {
    if (savedStty && process.stdin.isTTY) {
      try {
        execSync2(`stty ${savedStty}`, { stdio: ["inherit", "ignore", "ignore"] });
      } catch {
        try {
          execSync2("stty sane", { stdio: ["inherit", "ignore", "ignore"] });
        } catch {}
      }
    }
    let ttyFd = null;
    try {
      ttyFd = openSync2("/dev/tty", "w");
    } catch {
      if (process.stdout.isTTY) {
        ttyFd = 1;
      }
    }
    if (ttyFd !== null) {
      const sequences = [
        "\x1B[<u",
        "\x1B[?2004l",
        "\x1B[?1004l",
        "\x1B[?1049l",
        "\x1B[?25h",
        "\x1B[0m"
      ];
      for (const seq of sequences) {
        try {
          writeSync(ttyFd, seq);
        } catch {}
      }
      if (ttyFd !== 1) {
        try {
          closeSync2(ttyFd);
        } catch {}
      }
    }
  }
  const { fullArgs } = buildCodexArgs(args, proxyUrl);
  const stderrTail = new StderrRingBuffer;
  const wrapperLogPath = stateDir.codexWrapperLogFile;
  const startedAt = Date.now();
  stateDir.ensure();
  appendWrapperLog(wrapperLogPath, `spawn: codex ${fullArgs.map((a) => a.includes(" ") ? JSON.stringify(a) : a).join(" ")}`);
  const child = spawn3("codex", fullArgs, {
    stdio: ["inherit", "inherit", "pipe"],
    env: buildChildEnv()
  });
  if (typeof child.pid === "number") {
    writeFileSync4(stateDir.tuiPidFile, `${child.pid}
`, "utf-8");
    appendWrapperLog(wrapperLogPath, `child pid=${child.pid}`);
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      try {
        process.stderr.write(chunk);
      } catch {}
      stderrTail.append(chunk);
    });
  }
  let cleanedTuiPid = false;
  function cleanupTuiPidFile() {
    if (cleanedTuiPid)
      return;
    cleanedTuiPid = true;
    try {
      unlinkSync2(stateDir.tuiPidFile);
    } catch {}
  }
  process.on("exit", () => {
    restoreTerminal();
    cleanupTuiPidFile();
  });
  process.on("SIGINT", () => {
    restoreTerminal();
    cleanupTuiPidFile();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restoreTerminal();
    cleanupTuiPidFile();
    process.exit(143);
  });
  child.on("exit", (code, signal) => {
    cleanupTuiPidFile();
    const runtimeMs = Date.now() - startedAt;
    const tail = stderrTail.toString();
    const tailLines = tail.length === 0 ? "(no stderr captured)" : tail;
    let classification = "normal";
    if (/ERROR: remote app server/.test(tail))
      classification = "fatal_exit";
    else if (/Error: .* failed: Not initialized/.test(tail))
      classification = "not_initialized_after_reconnect";
    else if (/Error: .* failed:/.test(tail))
      classification = "rpc_error_exit";
    else if (signal)
      classification = `signal:${signal}`;
    else if (typeof code === "number" && code !== 0)
      classification = `nonzero_exit:${code}`;
    else if (code === 0 && tail.trim().length === 0)
      classification = "exit_0_empty_stderr";
    appendWrapperLog(wrapperLogPath, [
      `exit: code=${code ?? "null"} signal=${signal ?? "null"} runtime_ms=${runtimeMs} pid=${child.pid ?? "unknown"} classification=${classification}`,
      `--- last stderr (${stderrTail.byteLength} bytes) ---`,
      tailLines,
      `--- end stderr ---`
    ].join(`
`));
    process.exit(code ?? 0);
  });
  child.on("error", (err) => {
    cleanupTuiPidFile();
    appendWrapperLog(wrapperLogPath, `spawn error: ${err.message}`);
    if (err.code === "ENOENT") {
      console.error("Error: codex not found in PATH.");
      console.error("Install Codex: https://github.com/openai/codex");
      process.exit(1);
    }
    console.error(`Error starting Codex: ${err.message}`);
    process.exit(1);
  });
}
function proxyHealthUrl(proxyUrl) {
  const url = new URL(proxyUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/healthz";
  url.search = "";
  url.hash = "";
  return url.toString();
}
async function waitForProxyReady(proxyUrl, maxRetries = 20, delayMs = 100) {
  const healthUrl = proxyHealthUrl(proxyUrl);
  for (let attempt = 0;attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, delayMs));
  }
  throw new Error(`Timed out waiting for Codex proxy readiness on ${healthUrl}`);
}
var OWNED_FLAGS2, TUI_SUBCOMMANDS, NON_TUI_SUBCOMMANDS;
var init_codex = __esm(() => {
  init_state_dir();
  init_config_service();
  init_daemon_lifecycle();
  init_stderr_ring_buffer();
  init_claude();
  OWNED_FLAGS2 = ["--remote"];
  TUI_SUBCOMMANDS = new Set(["resume", "fork"]);
  NON_TUI_SUBCOMMANDS = new Set([
    "exec",
    "e",
    "review",
    "login",
    "logout",
    "mcp",
    "mcp-server",
    "plugin",
    "remote-control",
    "update",
    "app-server",
    "exec-server",
    "app",
    "completion",
    "sandbox",
    "debug",
    "apply",
    "a",
    "cloud",
    "features",
    "help"
  ]);
});

// src/cli/kill.ts
var exports_kill = {};
__export(exports_kill, {
  runKill: () => runKill
});
import { execFileSync as execFileSync5 } from "child_process";
import { readFileSync as readFileSync4, unlinkSync as unlinkSync3 } from "fs";
async function runKill() {
  console.log(`AgentBridge Kill \u2014 stopping daemon and managed Codex TUI
`);
  const stateDir = new StateDirResolver;
  const controlPort = parseInt(process.env.AGENTBRIDGE_CONTROL_PORT ?? "4502", 10);
  const lifecycle = new DaemonLifecycle({
    stateDir,
    controlPort,
    log: (msg) => console.log(`  ${msg}`)
  });
  lifecycle.markKilled();
  const tuiKilled = await killManagedCodexTui(stateDir, (msg) => console.log(`  ${msg}`));
  const killed = await lifecycle.kill();
  if (killed || tuiKilled) {
    console.log(`
AgentBridge stopped.`);
    console.log("Please restart Claude Code (`agentbridge claude`), switch to a new conversation, or run `/resume` to fully disconnect.");
  } else {
    console.log(`
No running AgentBridge daemon or managed Codex TUI found.`);
    console.log("Stale state files cleaned up (if any).");
  }
}
async function killManagedCodexTui(stateDir, log, gracefulTimeoutMs = 3000) {
  const pid = readTuiPid(stateDir);
  if (!pid) {
    log("No Codex TUI pid file found");
    removeTuiPidFile(stateDir);
    return false;
  }
  if (!isProcessAlive(pid)) {
    log(`Codex TUI pid ${pid} is not alive, cleaning up stale pid file`);
    removeTuiPidFile(stateDir);
    return false;
  }
  if (!isManagedCodexTuiProcess(pid)) {
    log(`Pid ${pid} is alive but is NOT a managed AgentBridge Codex TUI \u2014 refusing to kill. Cleaning up stale pid file.`);
    removeTuiPidFile(stateDir);
    return false;
  }
  log(`Sending SIGTERM to Codex TUI pid ${pid}`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    removeTuiPidFile(stateDir);
    return false;
  }
  const deadline = Date.now() + gracefulTimeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      log(`Codex TUI pid ${pid} stopped gracefully`);
      removeTuiPidFile(stateDir);
      return true;
    }
    await new Promise((resolve2) => setTimeout(resolve2, 200));
  }
  log(`Codex TUI pid ${pid} did not stop gracefully, sending SIGKILL`);
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
  removeTuiPidFile(stateDir);
  return true;
}
function readTuiPid(stateDir) {
  try {
    const raw = readFileSync4(stateDir.tuiPidFile, "utf-8").trim();
    if (!raw)
      return null;
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}
function removeTuiPidFile(stateDir) {
  try {
    unlinkSync3(stateDir.tuiPidFile);
  } catch {}
}
function isManagedCodexTuiProcess(pid) {
  try {
    const cmd = execFileSync5("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" }).trim();
    return cmd.includes("codex") && cmd.includes("--enable") && cmd.includes("tui_app_server") && cmd.includes("--remote");
  } catch {
    return false;
  }
}
var init_kill = __esm(() => {
  init_state_dir();
  init_daemon_lifecycle();
});

// package.json
var require_package = __commonJS((exports, module) => {
  module.exports = {
    name: "@raysonmeng/agentbridge",
    version: "0.1.6",
    description: "Bridge between Claude Code and Codex \u2014 bidirectional agent communication via MCP Channel + JSON-RPC",
    type: "module",
    bin: {
      agentbridge: "dist/cli.js",
      abg: "dist/cli.js",
      "agent-router": "dist/agent-router.js"
    },
    files: [
      "dist/",
      "plugins/",
      ".claude-plugin/",
      "scripts/postinstall.cjs",
      "README.md",
      "LICENSE"
    ],
    scripts: {
      start: "bun run src/bridge.ts",
      "build:cli": "mkdir -p dist && bun build src/cli.ts --outfile dist/cli.js --target bun && bun build src/agent-router/cli.ts --outfile dist/agent-router.js --target bun && chmod +x dist/cli.js dist/agent-router.js",
      "build:plugin": "mkdir -p plugins/agentbridge/server && bun build src/bridge.ts --outfile plugins/agentbridge/server/bridge-server.js --target bun && bun build src/daemon.ts --outfile plugins/agentbridge/server/daemon.js --target bun",
      "verify:plugin-sync": "node scripts/verify-plugin-sync.cjs",
      prepublishOnly: "bun run build:cli && bun run build:plugin",
      "validate:plugin": "claude plugin validate plugins/agentbridge && claude plugin validate .claude-plugin/marketplace.json",
      test: "bun test src",
      typecheck: "tsc --noEmit",
      "validate:plugin-versions": "bun scripts/check-plugin-versions.js",
      check: "tsc --noEmit && bun test src && bun run verify:plugin-sync && bun scripts/check-plugin-versions.js"
    },
    repository: {
      type: "git",
      url: "https://github.com/abdullahsajidfr/agent-bridge.git"
    },
    homepage: "https://github.com/abdullahsajidfr/agent-bridge#readme",
    bugs: {
      url: "https://github.com/abdullahsajidfr/agent-bridge/issues"
    },
    keywords: [
      "claude-code",
      "codex",
      "mcp",
      "agent",
      "bridge",
      "multi-agent",
      "channels"
    ],
    author: "AgentBridge Contributors",
    license: "MIT",
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.27.1"
    },
    devDependencies: {
      "@types/bun": "^1.3.11",
      typescript: "^5.8.0"
    }
  };
});

// src/cli.ts
async function main() {
  switch (command) {
    case "init":
      const { runInit: runInit2 } = await Promise.resolve().then(() => (init_init(), exports_init));
      await runInit2();
      break;
    case "dev":
      const { runDev: runDev2 } = await Promise.resolve().then(() => (init_dev(), exports_dev));
      await runDev2();
      break;
    case "claude":
      const { runClaude: runClaude2 } = await Promise.resolve().then(() => (init_claude(), exports_claude));
      await runClaude2(restArgs);
      break;
    case "codex":
      const { runCodex: runCodex2 } = await Promise.resolve().then(() => (init_codex(), exports_codex));
      await runCodex2(restArgs);
      break;
    case "kill":
      const { runKill: runKill2 } = await Promise.resolve().then(() => (init_kill(), exports_kill));
      await runKill2();
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    case "--version":
    case "-v":
      printVersion();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(`Run "agentbridge --help" (or "abg --help") for usage.`);
      process.exit(1);
  }
}
function printHelp() {
  console.log(`
AgentBridge \u2014 Multi-agent collaboration bridge

Usage:
  agentbridge <command> [args...]
  abg <command> [args...]

Commands:
  init              Install plugin, check dependencies, generate project config
  dev               Register local marketplace + install plugin (for local dev)
  claude [args...]  Start Claude Code with push channel enabled
  codex [args...]   Start Codex TUI connected to AgentBridge daemon
  kill              Force kill all AgentBridge processes

Options:
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  abg init                     # First-time setup
  abg claude                   # Start Claude Code
  abg claude --resume          # Start Claude Code and resume session
  abg codex                    # Start Codex TUI
  abg codex --model o3         # Start Codex with specific model
  abg kill                     # Emergency: kill all processes
`.trim());
}
function printVersion() {
  try {
    const pkg = require_package();
    console.log(`agentbridge v${pkg.version}`);
  } catch {
    console.log("agentbridge (version unknown)");
  }
}
var args, command, restArgs, MARKETPLACE_NAME = "agentbridge", PLUGIN_NAME = "agentbridge";
var init_cli = __esm(() => {
  args = process.argv.slice(2);
  command = args[0];
  restArgs = args.slice(1);
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
});
init_cli();

export {
  PLUGIN_NAME,
  MARKETPLACE_NAME
};
