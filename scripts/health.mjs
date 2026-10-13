const urls = [
  `http://127.0.0.1:${process.env.PORT ?? 8787}/health`,
  `http://127.0.0.1:${process.env.DEPTH_KEEPER_HEALTH_PORT ?? 8786}/healthz`,
  `http://127.0.0.1:${process.env.DEPTH_MAKER_HEALTH_PORT ?? 8789}/healthz`,
];
if (process.env.PYTH_ORACLE_MODE === "hermes")
  urls.push(
    `http://127.0.0.1:${process.env.DEPTH_PUBLISH_HEALTH_PORT ?? 8788}/healthz`,
  );
try {
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Unhealthy Depth service");
      const value = await response.json();
      if (value.healthy === false) throw new Error("Unhealthy Depth worker");
    }),
  );
} catch {
  process.exitCode = 1;
}
