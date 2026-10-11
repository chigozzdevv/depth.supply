import type { AutomationView } from "@depthhq/maker-sdk";

export type AutomationRecord = AutomationView & {
  operatorSecret: string;
  agentSecret: `0x${string}`;
  started?: boolean;
  hedgeBound?: boolean;
  fundingTransaction?: {
    bytes: string;
    blockhash: string;
    lastValidBlockHeight: number;
  };
};
export function publicAutomation(record: AutomationRecord): AutomationView {
  const {
    operatorSecret: _operator,
    agentSecret: _agent,
    started: _started,
    hedgeBound: _bound,
    fundingTransaction: _funding,
    ...view
  } = record;
  return view;
}
export class AutomationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export const automationError = (error: unknown) =>
  (error instanceof Error ? error.message : "Automation is unavailable")
    .replace(/(?:https?|wss?):\/\/[^\s]+/g, "[service endpoint]")
    .replace(/0x[0-9a-fA-F]{64}|\b[0-9a-fA-F]{64}\b/g, "[redacted]")
    .slice(0, 400);
