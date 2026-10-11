import type { AmountSelector, DepthClient, PendingItem } from "@depthhq/sdk";
import { nonce } from "@/shared/depth/format";

export type FundingAction = "deposit" | "withdraw" | "allocate" | "release";
export type FundingRequest = {
  action: FundingAction;
  amount: AmountSelector;
  nonce: bigint;
};
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const actions = new Set(["deposit", "withdraw", "allocate", "release"]);
const maximum = (1n << 64n) - 1n;

export class FundingStore {
  private readonly key: string;

  constructor(
    private readonly storage: Storage,
    sdk: DepthClient,
  ) {
    this.key = `depth:funds:${sdk.options.environment}:${sdk.program.programId.toBase58()}:${sdk.options.wallet.publicKey.toBase58()}`;
  }

  read(): FundingRequest | undefined {
    const text = this.storage.getItem(this.key);
    if (!text) return;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Saved transfer is invalid. Recover it from Pending.");
    }
    if (
      !value ||
      value.version !== 1 ||
      !actions.has(value.action) ||
      typeof value.nonce !== "string" ||
      !/^\d+$/.test(value.nonce) ||
      typeof value.amount !== "string"
    )
      throw new Error("Saved transfer is invalid. Recover it from Pending.");
    const amount =
      value.amount === "all" || /^(?:10|25|50|100)%$/.test(value.amount)
        ? (value.amount as AmountSelector)
        : /^\d+$/.test(value.amount)
          ? BigInt(value.amount)
          : undefined;
    const id = BigInt(value.nonce);
    if (
      amount === undefined ||
      id > maximum ||
      (typeof amount === "bigint" && (amount <= 0n || amount > maximum)) ||
      (value.action === "deposit" && typeof amount !== "bigint")
    )
      throw new Error("Saved transfer is invalid. Recover it from Pending.");
    return { action: value.action, amount, nonce: id };
  }

  save(request: FundingRequest): void {
    this.storage.setItem(
      this.key,
      JSON.stringify({
        version: 1,
        ...request,
        amount: request.amount.toString(),
        nonce: request.nonce.toString(),
      }),
    );
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}

function handle(sdk: DepthClient, request: FundingRequest) {
  const account = sdk.account();
  return request.action === "deposit"
    ? account.depositHandle(request.nonce)
    : request.action === "withdraw"
      ? account.withdrawalHandle(request.nonce)
      : account.transferHandle(request.nonce);
}

async function receipt(sdk: DepthClient, request: FundingRequest) {
  const operation = handle(sdk, request);
  const name =
    request.action === "deposit"
      ? "DepositReceipt"
      : request.action === "withdraw"
        ? "WithdrawalReceipt"
        : "MarginTransfer";
  return operation.client.read<{
    amount: { toString(): string };
    toMarket?: boolean;
  }>(name, operation.id);
}

export async function discoverFunding(
  sdk: DepthClient,
): Promise<FundingRequest | undefined> {
  let cursor: string | undefined;
  let item: PendingItem | undefined;
  do {
    const page = await sdk.account().pending({ limit: 100, cursor });
    item = page.items.find(
      (candidate: PendingItem) =>
        candidate.kind !== "trade" && candidate.kind !== "risk",
    );
    cursor = page.nextCursor;
  } while (!item && cursor);
  if (!item) return;
  const action =
    item.kind === "withdrawal"
      ? "withdraw"
      : item.kind === "allocation"
        ? "allocate"
        : (item.kind as "deposit" | "release");
  const request: FundingRequest = { action, amount: 1n, nonce: item.nonce };
  const state = await receipt(sdk, request);
  if (!state) throw new Error("Pending transfer changed. Please reopen Funds.");
  await handle(sdk, request).status();
  return { ...request, amount: BigInt(state.amount.toString()) };
}

export async function settleFunding(
  sdk: DepthClient,
  request: FundingRequest,
): Promise<void> {
  let operation = handle(sdk, request);
  const state = await receipt(sdk, request);
  if (state) {
    if (
      typeof request.amount === "bigint" &&
      BigInt(state.amount.toString()) !== request.amount
    )
      throw new Error("Saved amount does not match the existing transfer.");
    if (
      (request.action === "allocate" || request.action === "release") &&
      state.toMarket !== (request.action === "allocate")
    )
      throw new Error("Saved operation does not match the existing transfer.");
  } else {
    const account = sdk.account();
    operation =
      request.action === "deposit"
        ? await account.deposit(request.amount as bigint, request.nonce)
        : request.action === "withdraw"
          ? await account.withdraw(request.amount, request.nonce)
          : request.action === "allocate"
            ? await account.allocate(
                { marketId: "SOL-USD", amount: request.amount },
                request.nonce,
              )
            : await account.release(
                { marketId: "SOL-USD", amount: request.amount },
                request.nonce,
              );
  }
  await operation.confirm();
}

export function fundingRequest(
  action: FundingAction,
  amount: AmountSelector,
): FundingRequest {
  return { action, amount, nonce: nonce() };
}
