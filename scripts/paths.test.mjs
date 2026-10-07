import assert from "node:assert/strict";
import { resolve, isAbsolute } from "node:path";
import test from "node:test";
import { repositoryRoot, resolvePath, settingPath } from "./paths.mjs";

test("operational paths resolve from the repository regardless of the caller directory", () => {
  const previous = process.cwd();
  try {
    process.chdir(resolve(repositoryRoot, "server"));
    assert.equal(
      resolvePath("keys/devnet/deployer.json"),
      resolve(repositoryRoot, "keys/devnet/deployer.json")
    );
    assert.ok(isAbsolute(repositoryRoot));
  } finally {
    process.chdir(previous);
  }
});

test("configured absolute paths are preserved", () => {
  assert.equal(
    settingPath("SIGNER", undefined, {
      SIGNER: "/private/tmp/depth-signer.json",
    }),
    "/private/tmp/depth-signer.json"
  );
});

test("empty optional paths remain unset and required paths use their default", () => {
  assert.equal(settingPath("MANIFEST", undefined, { MANIFEST: "" }), undefined);
  assert.equal(
    settingPath("SIGNER", "keys/devnet/deployer.json", { SIGNER: "" }),
    resolvePath("keys/devnet/deployer.json")
  );
});
