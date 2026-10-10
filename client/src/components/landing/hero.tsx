import Image from "next/image";
import { Texture } from "@/components/landing/texture";

export function Hero() {
  return (
    <section className="hero">
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
            <a href="/demo/trade" className="action">
              Run a Demo <span aria-hidden="true">↗</span>
            </a>
            <a href="#developers" className="action action-outline">
              Build with Depth <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div
            className="hero-ecosystem"
            aria-label="Built on Solana with confidential computation by Arcium"
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
          </div>
        </div>
      </div>
    </section>
  );
}
