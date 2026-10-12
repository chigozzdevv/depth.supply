import Fastify from "fastify";
import { automationRoute } from "@/features/automation/automation.route";
import { AutomationService } from "@/features/automation/automation.service";
import { AutomationStore } from "@/features/automation/automation.store";
import {
  AutomationRunner,
  automationFactory,
} from "@/features/automation/automation.runner";
import { automationConfig } from "@/shared/config/env";
import { makerRoute } from "@/features/maker/maker.route";
import { MakerService } from "@/features/maker/maker.service";
import { chainConnection } from "@/shared/chain/connection";
import { AutomationFunding } from "@/features/automation/funding.service";

const config = automationConfig();
const store = await AutomationStore.open(
  config.stateDirectory,
  config.secret,
  config.environment,
);
const runner = new AutomationRunner(store, automationFactory(config));
const funding = new AutomationFunding(
  store,
  chainConnection(`${config.serviceUrl.replace(/\/+$/, "")}/rpc`),
);
const service = new AutomationService(store, runner.has, funding);
const app = Fastify({ bodyLimit: 1024 });
automationRoute(app, service);
makerRoute(
  app,
  new MakerService(
    undefined,
    (owner) =>
      service.summary(owner)?.hedge ?? {
        maker: owner,
        enabled: false,
        snapshot: null,
      },
  ),
);
let running = true;
let updatedAt = 0;
let runnerError = false;
let fundingError = false;
let wake: (() => void) | undefined;
app.addHook("onRequest", async (_request, reply) => {
  reply.header("cache-control", "no-store");
});
app.get("/healthz", (_request, reply) => {
  const healthy =
    running &&
    !runnerError &&
    !fundingError &&
    updatedAt > 0 &&
    Date.now() - updatedAt < 240000;
  const workers = runner.health();
  reply.code(healthy && workers.healthy ? 200 : 503);
  return { healthy: healthy && workers.healthy, updatedAt, workers };
});
const stop = () => {
  running = false;
  wake?.();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  await app.listen({ host: "127.0.0.1", port: config.healthPort });
  while (running) {
    void runner
      .tick()
      .then(() => {
        updatedAt = Date.now();
        runnerError = false;
      })
      .catch(() => {
        runnerError = true;
      });
    void funding
      .tick()
      .then(() => {
        fundingError = false;
      })
      .catch(() => {
        fundingError = true;
      });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = undefined;
        resolve();
      }, config.intervalMs);
      wake = () => {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      };
    });
  }
} finally {
  await app.close();
  await runner.close();
  await funding.close();
  await store.close();
}
