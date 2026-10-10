"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

const examples = [
  {
    id: "app",
    label: "App SDK",
    code: `import {
  create_depth,
} from "@depthhq/sdk";

const admin = await create_depth({
  environment: "devnet",
  wallet: appOwnerWallet,
});

const registration =
  await admin.app.register({
    feeBps: 1,
  });

const { appId } =
  await registration.confirm();`,
  },
  {
    id: "maker",
    label: "Maker SDK",
    code: `import {
  create_depth_maker,
} from "@depthhq/maker-sdk";

const maker = await create_depth_maker({
  environment: "devnet",
  wallet: makerWallet,
});

const publication =
  await maker.quote.publish({
    marketId: "SOL-USD",
    bidE8: 19_900_000_000n,
    askE8: 20_100_000_000n,
    maxCapacity: 5_000_000_000n,
    validForSeconds: 30,
  });

const { quoteId } =
  await publication.confirm();`,
  },
] as const;

function highlight(line: string) {
  return line
    .split(/("[^"\n]*"|\b(?:import|from|const|await)\b|\b\d+\b)/g)
    .map((part, index) => (
      <span
        key={index}
        className={
          part.startsWith('"')
            ? "code-string"
            : /^(import|from|const|await|\d+)$/.test(part)
              ? "code-token"
              : undefined
        }
      >
        {part}
      </span>
    ));
}

export function Code() {
  const [active, setActive] = useState(0);
  const [copy, setCopy] = useState<"idle" | "copied" | "unavailable">("idle");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const example = examples[active];

  function select(index: number) {
    setActive(index);
    setCopy("idle");
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % examples.length;
    else if (event.key === "ArrowLeft")
      next = (index + examples.length - 1) % examples.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = examples.length - 1;
    else return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(example.code);
      setCopy("copied");
    } catch {
      setCopy("unavailable");
    }
  }

  return (
    <div className="code-editor">
      <div className="code-toolbar">
        <div role="tablist" aria-label="SDK examples" className="code-tabs">
          {examples.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`sdk-tab-${item.id}`}
              aria-controls={`sdk-panel-${item.id}`}
              aria-selected={active === index}
              tabIndex={active === index ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => navigate(event, index)}
              className="code-tab"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copyCode}
          aria-label={copy === "copied" ? "Code copied" : "Copy SDK example"}
          className="code-copy"
        >
          {copy === "copied" ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Copy size={13} aria-hidden="true" />
          )}
          {copy === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      {examples.map((item, index) => (
        <div
          key={item.id}
          id={`sdk-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`sdk-tab-${item.id}`}
          hidden={active !== index}
        >
          <pre className="code-source">
            <code>
              {item.code.split("\n").map((line, number) => (
                <span className="code-line" key={number}>
                  <span className="code-number" aria-hidden="true">
                    {String(number + 1).padStart(2, "0")}
                  </span>
                  {highlight(line)}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        </div>
      ))}
      {copy === "unavailable" && (
        <p className="code-error">
          Clipboard unavailable; select the code to copy.
        </p>
      )}
      <p className="sr-only" role="status">
        {copy === "unavailable"
          ? "Clipboard unavailable; select the code to copy."
          : copy === "copied"
            ? "Example copied to clipboard."
            : ""}
      </p>
    </div>
  );
}
