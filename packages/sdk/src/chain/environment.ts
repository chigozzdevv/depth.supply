import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { authenticateManifest } from "@/chain/manifest";
import type { DeploymentPolicy, SignedManifest } from "@/chain/manifest";
import { DepthError } from "@/operation/error";

export type DepthEnvironment = "localnet" | "devnet" | "mainnet-beta";

export type ConnectionOptions = {
  environment?: DepthEnvironment;
  connection?: Connection;
  deployment?: DeploymentPolicy;
  serviceUrl?: string;
  manifestUrl?: string;
};

export type ResolvedConnection = {
  connection: Connection;
  deployment: DeploymentPolicy;
  serviceUrl?: string;
  environment?: DepthEnvironment;
};

const environments = {
  localnet: {
    rpc: "http://127.0.0.1:8899",
    service: "http://127.0.0.1:8787",
  },
  devnet: {
    rpc: "https://api.devnet.solana.com",
    service: "https://depth.supply",
    genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  },
  "mainnet-beta": {
    rpc: "https://api.mainnet.solana.com",
    service: "https://depth.supply",
    genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  },
} as const;

const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function unavailable(message: string, cause?: unknown): DepthError {
  return new DepthError(
    "DEPLOYMENT_UNAVAILABLE",
    "validation",
    message,
    true,
    "Check the selected environment and its published deployment manifest",
    undefined,
    cause === undefined ? undefined : { cause },
  );
}

function endpoint(
  value: string,
  environment: DepthEnvironment,
  name: string,
): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(environment === "localnet" && url.protocol === "http:" && loopback)
  ) {
    throw new RangeError(
      `${name} must use HTTPS, or loopback HTTP on localnet`,
    );
  }
  return url.toString().replace(/\/$/, "");
}

async function upgradeAuthority(connection: Connection): Promise<PublicKey> {
  const program = await connection.getAccountInfo(
    DEPTH_PROGRAM_ID,
    "confirmed",
  );
  if (
    !program?.executable ||
    !program.owner.equals(loader) ||
    program.data.length !== 36 ||
    program.data.readUInt32LE(0) !== 2
  ) {
    throw unavailable(
      "Depth program is not deployed as an upgradeable program",
    );
  }
  const data = await connection.getAccountInfo(
    new PublicKey(program.data.subarray(4)),
    "confirmed",
  );
  if (
    !data?.owner.equals(loader) ||
    data.data.length < 45 ||
    data.data.readUInt32LE(0) !== 3 ||
    data.data[12] !== 1
  ) {
    throw unavailable("Depth deployment has no verifiable upgrade authority");
  }
  return new PublicKey(data.data.subarray(13, 45));
}

export async function resolveConnection(
  options: ConnectionOptions,
): Promise<ResolvedConnection> {
  if (!options.environment) {
    if (!options.connection || !options.deployment) {
      throw new RangeError(
        "Specify an environment or both connection and deployment policy",
      );
    }
    return {
      connection: options.connection,
      deployment: options.deployment,
      serviceUrl: options.serviceUrl,
    };
  }
  const environment = options.environment;
  const config = environments[environment];
  const connection =
    options.connection ?? new Connection(config.rpc, "confirmed");
  const serviceUrl = endpoint(
    options.serviceUrl ?? config.service,
    environment,
    "serviceUrl",
  );
  if (environment === "localnet") {
    return {
      connection,
      deployment: options.deployment ?? { localnet: true },
      serviceUrl,
      environment,
    };
  }
  const publicConfig = environments[environment];
  try {
    const genesis = await connection.getGenesisHash();
    if (genesis !== publicConfig.genesis) {
      throw unavailable("RPC genesis does not match the selected environment");
    }
    const trustedSigner = await upgradeAuthority(connection);
    const deployment =
      options.deployment ??
      (await (async () => {
        const url = endpoint(
          options.manifestUrl ??
            `${serviceUrl}/.well-known/depth/${environment}.json`,
          environment,
          "manifestUrl",
        );
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw unavailable(
            `Deployment manifest returned HTTP ${response.status}`,
          );
        }
        const manifest = (await response.json()) as SignedManifest;
        return { manifest, trustedSigner };
      })());
    if ("localnet" in deployment) {
      throw unavailable(
        "Public environments require a signed deployment manifest",
      );
    }
    if (!deployment.trustedSigner.equals(trustedSigner)) {
      throw unavailable("Manifest signer is not the onchain upgrade authority");
    }
    await authenticateManifest(deployment.manifest, trustedSigner);
    return { connection, deployment, serviceUrl, environment };
  } catch (error) {
    if (error instanceof DepthError) throw error;
    throw unavailable("Depth deployment could not be verified", error);
  }
}
