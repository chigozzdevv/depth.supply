import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, marketAddress } from "@depthhq/bindings";
import { PublicKey, type Connection } from "@solana/web3.js";
import { indexedDB } from "fake-indexeddb";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceViews } from "@/view/cache";
import { ViewSession } from "@/view/session";

test("one owner grant supports repeated and interrupted reads with encrypted device identity", async () => {
  globalThis.indexedDB = indexedDB;
  const owner = PublicKey.unique();
  let approvals = 0;
  let state: unknown;
  const program = {
    methods: {
      authorizeViews: (
        reader: PublicKey,
        viewKey: number[],
        expiresAt: anchor.BN,
        scopes: number,
      ) => ({
        accountsPartial: () => ({
          rpc: async () => {
            approvals++;
            state = {
              reader,
              viewKey,
              expiresAt,
              scopes,
              owner,
              market: marketAddress(),
              active: true,
            };
          },
        }),
      }),
      revokeViews: () => ({
        accountsPartial: () => ({
          rpc: async () => {
            approvals++;
            (state as { active: boolean }).active = false;
            return "revoked";
          },
        }),
      }),
    },
    coder: { accounts: { decode: () => state } },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfo: async () =>
      state ? { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) } : null,
  } as unknown as Connection;
  const requests: Record<string, unknown>[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    if (!init?.method) return Response.json({ enabled: true });
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ error: "view_submission_pending" }, { status: 503 });
  }) as typeof fetch;
  try {
    const scope = `devnet:program:${owner.toBase58()}`;
    const session = new ViewSession(
      program,
      connection,
      owner,
      "http://localhost",
      scope,
      new DeviceViews(),
    );
    await Promise.all([session.authorize(), session.authorize()]);
    assert.equal(approvals, 1);
    await assert.rejects(
      session.request("balance", PublicKey.default),
      /HTTP 503/,
    );
    const reloaded = new ViewSession(
      program,
      connection,
      owner,
      "http://localhost",
      scope,
      new DeviceViews(),
    );
    await assert.rejects(
      reloaded.request("balance", PublicKey.default),
      /HTTP 503/,
    );
    assert.equal(approvals, 1);
    assert.equal(requests[0].nonce, requests[1].nonce);
    assert.equal(requests[0].reader, requests[1].reader);
    const envelope = await new DeviceViews().read(`${scope}:authorization`);
    assert.ok(envelope);
    assert.doesNotMatch(
      new TextDecoder().decode(envelope.data),
      /signing|encryption/,
    );
    await reloaded.revoke();
    assert.equal((await session.status()).active, false);
    assert.equal(approvals, 2);
    await assert.rejects(
      session.request("balance", PublicKey.default),
      /disabled/,
    );
    assert.equal(approvals, 2);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
