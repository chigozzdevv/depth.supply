import { Cipher } from "@/components/landing/cipher";

export function Privacy() {
  return (
    <section
      id="privacy"
      className="privacy-section"
      aria-labelledby="privacy-title"
    >
      <div className="shell privacy-inner">
        <div>
          <h2 id="privacy-title" className="privacy-title">
            Keep your edge.
            <span>Trade encrypted.</span>
          </h2>
          <p className="privacy-copy">
            Encrypted quotes and positions. Confidential clearing through
            Arcium. Your wallet authorizes your private view.
          </p>
          <p className="privacy-boundary">
            <em>
              *Wallet addresses, markets, transaction activity, and token and
              margin transfers remain public.
            </em>
          </p>
        </div>
        <figure className="privacy-art">
          <Cipher />
        </figure>
      </div>
    </section>
  );
}
