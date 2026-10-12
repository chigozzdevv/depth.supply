import type {
  AutomationConfig,
  AutomationView,
  MakerClient,
} from "@depthhq/maker-sdk";
import { automationConfig, automationWire } from "@depthhq/maker-sdk";
import { units } from "@/shared/depth/format";

export const automationDefaults = {
  capacity: "100",
  inventory: "1000",
  spread: "20",
  reprice: "10",
  lifetime: "120",
  refresh: "60",
  hedge: false,
  account: "",
  ratio: "100",
  threshold: "10",
  exposure: "100",
  order: "100",
  slippage: "10",
  leverage: "3",
};
export type AutomationForm = typeof automationDefaults;
export function manualQuoteAllowed(profile: AutomationView | null) {
  return (
    !profile ||
    (profile.desired === "paused" &&
      ["configured", "paused"].includes(profile.phase) &&
      profile.funding?.status !== "pending")
  );
}
export async function readAutomation(
  maker: Pick<MakerClient, "automation">,
  authorize = false,
) {
  try {
    return await maker.automation.summary();
  } catch (cause) {
    if (
      !authorize ||
      !(cause instanceof Error) ||
      !/^Authorize (automation|access) with your maker wallet$/.test(
        cause.message,
      )
    )
      throw cause;
    await maker.automation.authorize();
    return maker.automation.summary();
  }
}
const plain = (value: string, decimals = 6) => {
  const base = 10n ** BigInt(decimals);
  const amount = BigInt(value);
  const fraction = (amount % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${amount / base}${fraction ? `.${fraction}` : ""}`;
};
export function automationForm(profile: AutomationView): AutomationForm {
  const { quote, hedge } = profile.config;
  return {
    ...automationDefaults,
    capacity: plain(quote.maxCapacity),
    inventory: plain(quote.maxInventoryNotional),
    spread: String(quote.spreadBps),
    reprice: String(quote.repriceBps),
    lifetime: String(quote.lifetimeSeconds),
    refresh: String(quote.refreshSeconds),
    hedge: Boolean(hedge),
    ...(hedge
      ? {
          account: hedge.account,
          ratio: String(hedge.policy.ratioBps / 100),
          threshold: plain(hedge.policy.thresholdNotional),
          exposure: plain(hedge.policy.maxUnhedgedNotional),
          order: plain(hedge.policy.maxOrderNotional),
          slippage: String(hedge.policy.maxSlippageBps),
          leverage: String(hedge.policy.maxLeverage),
        }
      : {}),
  };
}
export function automationInput(
  form: AutomationForm,
  current?: AutomationView | null,
): AutomationConfig {
  const integer = (value: string) => {
    if (!/^\d{1,6}$/.test(value))
      throw new Error("Enter positive integer limits");
    return Number(value);
  };
  const input: AutomationConfig = {
    quote: {
      ...(current ? automationConfig(current.config).quote : {}),
      maxCapacity: units(form.capacity),
      maxInventoryNotional: units(form.inventory),
      spreadBps: integer(form.spread),
      repriceBps: integer(form.reprice),
      lifetimeSeconds: integer(form.lifetime),
      refreshSeconds: integer(form.refresh),
    },
    hedge: form.hedge
      ? {
          account: form.account.trim() as `0x${string}`,
          policy: {
            ratioBps: integer(form.ratio) * 100,
            thresholdNotional: units(form.threshold),
            maxUnhedgedNotional: units(form.exposure),
            maxOrderNotional: units(form.order),
            batchMs: current?.config.hedge?.policy.batchMs ?? 5000,
            maxUnhedgedMs: current?.config.hedge?.policy.maxUnhedgedMs ?? 90000,
            maxSlippageBps: integer(form.slippage),
            maxPriceAgeMs: current?.config.hedge?.policy.maxPriceAgeMs ?? 5000,
            orderTtlMs: current?.config.hedge?.policy.orderTtlMs ?? 10000,
            maxLeverage: integer(form.leverage),
          },
        }
      : undefined,
  };
  return automationConfig(automationWire(input));
}
