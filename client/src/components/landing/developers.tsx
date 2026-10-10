import { Code } from "@/components/landing/code";

export function Developers() {
  return (
    <section
      id="developers"
      className="shell developers-section"
      aria-labelledby="developers-title"
    >
      <div className="developers-copy">
        <h2 id="developers-title">
          Your product.
          <span>Built on Depth.</span>
        </h2>
        <p>
          Add private perpetuals to your app or supply liquidity as a maker. Our
          SDKs handle encryption and track each operation.
        </p>
      </div>
      <Code />
    </section>
  );
}
