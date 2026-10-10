import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [entry, target, output] = process.argv.slice(2);
const result = await Bun.build({
  entrypoints: [entry],
  target,
  format: "esm",
  external: [
    "@anchor-lang/*",
    "@depthhq/*",
    "@solana/*",
    "@nktkas/*",
    "viem",
    "viem/*",
  ],
  plugins: [
    {
      name: "arcium-browser",
      setup(build) {
        if (target === "browser")
          build.onLoad(
            { filter: /maker-sdk\/src\/fill\/store\.ts$/ },
            async ({ path }) => ({
              contents: await readFile(
                join(dirname(path), "browser.ts"),
                "utf8",
              ),
              loader: "ts",
            }),
          );
        build.onLoad(
          { filter: /@arcium-hq\/client\/build\/index\.mjs$/ },
          async ({ path }) => {
            const source = await readFile(path, "utf8");
            const original =
              "import anchor__default, { BorshCoder, convertIdlToCamelCase, Program } from '@anchor-lang/core';";
            if (!source.includes(original))
              throw new Error(
                "Arcium's Anchor import changed; review browser compatibility",
              );
            const cryptoImport =
              "import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';";
            if (target === "browser" && !source.includes(cryptoImport))
              throw new Error(
                "Arcium's crypto import changed; review browser compatibility",
              );
            const portable =
              target === "browser"
                ? source.replace(
                    cryptoImport,
                    `import { randomBytes, createHash, createCipheriv, createDecipheriv } from ${JSON.stringify(fileURLToPath(new URL("./crypto.mjs", import.meta.url)))};`,
                  )
                : source;
            return {
              contents: portable.replace(
                original,
                "import { Buffer } from 'buffer';\nimport * as anchor__default from '@anchor-lang/core';\nimport { BorshCoder, convertIdlToCamelCase, Program } from '@anchor-lang/core';",
              ),
              loader: "js",
            };
          },
        );
      },
    },
  ],
});
if (!result.success)
  throw new AggregateError(result.logs, "Package bundle failed");
await Bun.write(output, result.outputs[0]);
