import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { MaintenanceService } from "@/features/maintenance/maintenance.service";
import type { ChainSigner } from "@/shared/chain/chain.signer";

test("demo maintenance renews only its own live backstop and resumes only recoverable incidents", async () => {
  const owner = PublicKey.unique();
  const now = Math.floor(Date.now() / 1000);
  const integer = (value: number) => ({
    toNumber: () => value,
    toString: () => String(value),
  });
  let incident = "manualPause";
  let expiry = now + 100;
  let maker = owner;
  let genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  const calls: string[] = [];
  const chain = {
    market: PublicKey.unique(),
    protocol: PublicKey.unique(),
    clearing: PublicKey.unique(),
    wallet: { publicKey: owner },
    connection: { getGenesisHash: async () => genesis },
    read: async (name: string) =>
      name === "Protocol"
        ? { authority: owner, vault: PublicKey.unique() }
        : name === "Market"
          ? {
              status: { paused: {} },
              incident: { [incident]: {} },
              backstopOffer: PublicKey.unique(),
              pendingOrders: 0,
              oracleTimestamp: integer(now),
              config: { maxOracleAgeSeconds: 300 },
            }
          : { maker, status: { active: {} }, expiry: integer(expiry) },
    program: {
      methods: Object.fromEntries(
        ["renewBackstop", "resumeMarket"].map((name) => [
          name,
          () => ({
            accountsPartial: () => ({
              rpc: async () => {
                calls.push(name);
                return name;
              },
            }),
          }),
        ]),
      ),
    },
  } as unknown as ChainSigner;
  assert.equal(await new MaintenanceService(chain, false).advance(), undefined);
  assert.equal(
    (await new MaintenanceService(chain, true).advance())?.stage,
    "renew_backstop",
  );
  expiry = now + 80_000;
  assert.equal(await new MaintenanceService(chain, true).advance(), undefined);
  incident = "missedFunding";
  assert.equal(
    (await new MaintenanceService(chain, true).advance())?.stage,
    "resume_demo_market",
  );
  incident = "makerDefault";
  assert.equal(await new MaintenanceService(chain, true).advance(), undefined);
  expiry = now - 1;
  incident = "staleOracle";
  assert.equal(await new MaintenanceService(chain, true).advance(), undefined);
  expiry = now + 100;
  maker = PublicKey.unique();
  assert.equal(await new MaintenanceService(chain, true).advance(), undefined);
  genesis = "mainnet";
  await assert.rejects(
    new MaintenanceService(chain, true).advance(),
    /restricted to devnet/,
  );
  assert.deepEqual(calls, ["renewBackstop", "resumeMarket"]);
});
