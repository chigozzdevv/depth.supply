const questions = [
  {
    question: "How does Depth work?",
    answer:
      "Makers commit collateral and publish encrypted quotes. Arcium processes trades privately; the Solana program verifies the result and applies settlement. Your wallet authorizes access to your account’s private view.",
  },
  {
    question: "What remains public?",
    answer:
      "Wallet addresses, markets, transaction timing, and token and margin transfers remain visible. A maker sees its own fill, and an app knows the inputs it collects.",
  },
  {
    question: "What are the trading fees?",
    answer:
      "Each filled trade pays 0.05% of its notional: 0.03% to Depth, 0.01% to insurance, and a 0.01% maker rebate. Apps may add up to 0.02%. Solana fees, Arcium costs, and account rent are separate. Unfilled orders have no trade fee.",
  },
  {
    question: "What if Arcium becomes unavailable?",
    answer:
      "Depth pauses new risk and unsafe withdrawals. Permanent failure can trigger committee-authorized recovery, revealing committed state for payouts. Depth controls the current devnet committee and can combine its recovery shares to decrypt that state.",
  },
] as const;

export function Faq() {
  return (
    <section
      id="questions"
      className="shell faq-section"
      aria-labelledby="questions-title"
    >
      <div>
        <h2 id="questions-title">
          Questions,
          <span>answered.</span>
        </h2>
      </div>
      <div className="faq-list">
        {questions.map((item, index) => (
          <details
            key={item.question}
            name="depth-questions"
            open={index === 0}
            className="faq-item"
          >
            <summary>
              {item.question}
              <span className="faq-icon" aria-hidden="true" />
            </summary>
            <p className="faq-answer">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
