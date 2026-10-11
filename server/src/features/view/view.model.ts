import type { ViewRequest, ViewReceipt } from "@depthhq/schema";

export type ViewRecord = {
  key: string;
  request: ViewRequest;
  receipt: ViewReceipt;
  createdAt: number;
  transaction?: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
  closed?: boolean;
};

export class ViewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
