import Image from "next/image";
import Link from "next/link";
import { Texture } from "@/components/landing/texture";

export function Hero() {
  return (
    <section id="top" className="hero">
      <Texture />
      <div className="shell hero-inner">
        <div className="hero-copy">
          <h1 className="hero-title">
            Private perps.
            <span>
              Shared <em className="font-pixel not-italic">depth.</em>
            </span>
          </h1>
          <p className="hero-description">
            Bring perpetual trading to your app with encrypted maker quotes and
            confidential clearing on Solana.
          </p>
          <div className="hero-actions">
            <Link href="/demo/trade" className="action">
              Run a Demo <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/docs" className="action action-outline">
              Build with Depth <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div
            className="hero-ecosystem"
            aria-label="Solana settlement, Arcium confidential computation, and optional Hyperliquid maker hedging"
          >
            <a
              href="https://solana.com/"
              aria-label="Built on Solana"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/brands/solana.svg"
                width={84}
                height={13}
                alt="Solana"
                className="solana-logo"
              />
            </a>
            <span className="ecosystem-divider" aria-hidden="true" />
            <a
              href="https://www.arcium.com/"
              aria-label="Confidential computation by Arcium"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/brands/arcium.svg"
                width={92}
                height={12}
                alt="Arcium"
                className="arcium-logo"
              />
            </a>
            <span className="ecosystem-divider" aria-hidden="true" />
            <a
              href="https://hyperliquid.xyz/"
              aria-label="Optional maker hedging on Hyperliquid"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/brands/hyperliquid.svg"
                width={96}
                height={23}
                alt="Hyperliquid"
                className="hyperliquid-logo"
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
