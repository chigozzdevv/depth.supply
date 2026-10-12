import { spawn } from "node:child_process";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { repositoryRoot, resolvePath } from "./paths.mjs";

const directory = resolvePath("data/runtime");
const pidFile = join(directory, "services.json");
const script = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const action = process.argv[2] ?? "status";
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "EPERM") return true;
    if (error.code === "ESRCH") return false;
    throw error;
  }
};
const read = () =>
  readFile(pidFile, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
await mkdir(directory, { recursive: true, mode: 0o700 });
const current = await read();
if (action === "start") {
  if (process.env.PYTH_ORACLE_MODE === "hermes" && !process.env.PYTH_API_KEY)
    throw new Error(
      "PYTH_API_KEY is required to supervise the Hermes publisher",
    );
  if (current && alive(current.pid)) {
    console.info(`Depth services already running (${current.pid})`);
  } else {
    const log = await open(join(directory, "supervisor.log"), "a", 0o600);
    const child = spawn(
      process.execPath,
      ["--env-file-if-exists=.env.local", script, "run"],
      {
        cwd: repositoryRoot,
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    child.unref();
    await log.close();
    console.info(`Depth service supervisor started (${child.pid})`);
  }
} else if (action === "stop") {
  if (current && alive(current.pid)) process.kill(current.pid, "SIGTERM");
  console.info("Depth service shutdown requested");
} else if (action === "status") {
  console.info(
    JSON.stringify({
      running: Boolean(current && alive(current.pid)),
      ...current,
    }),
  );
} else if (action === "run") {
  if (current && alive(current.pid))
    throw new Error("Depth service supervisor already running");
  const lock = await open(`${pidFile}.lock`, "wx", 0o600).catch(
    async (error) => {
      if (error.code !== "EEXIST") throw error;
      const prior = JSON.parse(await readFile(`${pidFile}.lock`, "utf8"));
      if (!Number.isSafeInteger(prior.pid) || alive(prior.pid))
        throw new Error("Depth service supervisor already running");
      if ((await readFile(`${pidFile}.lock`, "utf8")) !== JSON.stringify(prior))
        throw new Error("Supervisor lease changed");
      await unlink(`${pidFile}.lock`);
      return open(`${pidFile}.lock`, "wx", 0o600);
    },
  );
  await lock.writeFile(
    JSON.stringify({
      pid: process.pid,
      token: randomBytes(16).toString("hex"),
    }),
  );
  await lock.sync();
  const bun = process.env.DEPTH_BUN_BIN ?? "bun";
  const definitions = [
    [
      "api",
      bun,
      ["--env-file=.env.local", "server/src/server.ts"],
      `http://127.0.0.1:${process.env.PORT ?? 8787}/health`,
    ],
    [
      "keeper",
      bun,
      [
        "--env-file=.env.local",
        "server/src/features/settlement/settlement.worker.ts",
      ],
      `http://127.0.0.1:${process.env.DEPTH_KEEPER_HEALTH_PORT ?? 8786}/healthz`,
    ],
    [
      "maker",
      bun,
      [
        "--env-file=.env.local",
        "server/src/features/automation/automation.worker.ts",
      ],
      `http://127.0.0.1:${process.env.DEPTH_MAKER_HEALTH_PORT ?? 8789}/healthz`,
    ],
    [
      "client",
      process.execPath,
      [
        require.resolve("next/dist/bin/next", {
          paths: [resolvePath("client")],
        }),
        "dev",
        "--port",
        "3100",
      ],
      "http://127.0.0.1:3100/demo/trade",
    ],
  ];
  if (process.env.PYTH_ORACLE_MODE === "hermes")
    definitions.splice(1, 0, [
      "publisher",
      bun,
      ["--env-file=.env.local", "server/src/features/oracle/oracle.worker.ts"],
      `http://127.0.0.1:${process.env.DEPTH_PUBLISH_HEALTH_PORT ?? 8788}/healthz`,
    ]);
  const children = new Map();
  let stopping = false;
  const timers = new Set();
  const save = () => {
    const temporary = `${pidFile}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({
        pid: process.pid,
        startedAt: started,
        services: Object.fromEntries(
          [...children].map(([name, entry]) => [
            name,
            { pid: entry.child.pid, restarts: entry.restarts },
          ]),
        ),
      }),
      { mode: 0o600 },
    );
    renameSync(temporary, pidFile);
  };
  const started = Date.now();
  const launch = async (definition, restarts = 0) => {
    if (stopping) return;
    const [name, command, args, health] = definition;
    const log = await open(join(directory, `${name}.log`), "a", 0o600);
    const child = spawn(command, args, {
      cwd: name === "client" ? resolvePath("client") : repositoryRoot,
      stdio: ["ignore", log.fd, log.fd],
      env: process.env,
    });
    await log.close();
    children.set(name, {
      child,
      restarts,
      health,
      launchedAt: Date.now(),
      failures: 0,
    });
    await save();
    child.once("error", (error) => console.error(`${name}: ${error.message}`));
    child.once("exit", () => {
      children.delete(name);
      save();
      if (stopping) return;
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          void launch(definition, restarts + 1).catch(shutdown);
        },
        Math.min(30_000, 1000 * 2 ** Math.min(restarts, 5)),
      );
      timers.add(timer);
    });
  };
  const shutdown = async (error) => {
    if (stopping) return;
    stopping = true;
    if (error instanceof Error) console.error(error.message);
    clearInterval(watch);
    timers.forEach(clearTimeout);
    for (const [name, timeout] of [
      ["client", 10_000],
      ["maker", 240_000],
      ["publisher", 60_000],
      ["keeper", 30_000],
      ["api", 30_000],
    ]) {
      const entry = children.get(name);
      if (!entry) continue;
      entry.child.kill("SIGTERM");
      const deadline = Date.now() + timeout;
      while (children.has(name) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 250));
      if (children.has(name)) entry.child.kill("SIGKILL");
    }
    for (const { child } of children.values()) child.kill("SIGKILL");
    await lock.close();
    await unlink(`${pidFile}.lock`);
    await unlink(pidFile);
    process.exit(error instanceof Error ? 1 : 0);
  };
  const watch = setInterval(() => {
    void Promise.all(
      [...children].map(async ([name, entry]) => {
        if (Date.now() - entry.launchedAt < 60_000) return;
        try {
          const response = await fetch(entry.health, {
            signal: AbortSignal.timeout(5000),
          });
          if (name === "keeper" || name === "maker") {
            const health = await response.json();
            if (health.updatedAt && Date.now() - health.updatedAt > 300_000)
              throw new Error("Worker progress stalled");
            if (health.workers?.workers?.some((worker) => worker.stalled))
              throw new Error("Maker task stalled");
          } else if (!response.ok) throw new Error("Service unavailable");
          entry.failures = 0;
        } catch {
          if (++entry.failures >= 3) {
            console.error(`${name}: restarting unresponsive service`);
            entry.child.kill("SIGKILL");
          }
        }
      }),
    ).catch(shutdown);
  }, 15_000);
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  for (const definition of definitions) await launch(definition);
} else throw new Error("Usage: services.mjs start|stop|status");
