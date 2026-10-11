import { endpoint, environments, type DepthEnvironment } from "@/chain/network";
export { endpoint, environments } from "@/chain/network";
export type { DepthEnvironment } from "@/chain/network";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { authenticateManifest, verifyDeployment } from "@/chain/manifest";
import type { DeploymentPolicy, SignedManifest } from "@/chain/manifest";
import { DepthError } from "@/operation/error";
import { HttpConnection } from "@/chain/connection";

export type ConnectionOptions = {
  environment?: DepthEnvironment;
  connection?: Connection;
  rpcUrl?: string;
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
    { commitment: "confirmed", dataSlice: { offset: 0, length: 45 } },
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
    options.connection ??
    new HttpConnection(
      endpoint(options.rpcUrl ?? config.rpc, environment, "rpcUrl"),
      "confirmed",
    );
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
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
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

export async function prepare_depth(
  options: ConnectionOptions,
): Promise<ResolvedConnection> {
  const resolved = await resolveConnection(options);
  await verifyDeployment(
    { connection: resolved.connection },
    resolved.deployment,
  );
  return resolved;
}
