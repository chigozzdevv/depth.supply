const participants = [
  {
    id: "apps",
    label: "For apps",
    title: "Your interface.\nOur clearing.",
    body: "Add perpetual trading to your app, access shared maker liquidity, and set your app fee.",
  },
  {
    id: "makers",
    label: "For makers",
    title: "Quote privately.\nReach every app.",
    body: "Back your encrypted quotes with collateral and earn rebates when they fill.",
  },
  {
    id: "traders",
    label: "For traders",
    title: "Your position.\nYour private view.",
    body: "Open, manage, and close positions through a Depth-powered app, with your position details encrypted.",
  },
] as const;

export function Protocol() {
  return (
    <section
      id="protocol"
      className="shell venue-section"
      aria-labelledby="venue-title"
    >
      <div className="venue-heading">
        <h2 id="venue-title">
          One venue.
          <span>Shared across apps.</span>
        </h2>
      </div>
      <div className="participants">
        {participants.map((participant) => (
          <article
            id={participant.id}
            className="participant"
            key={participant.id}
          >
            <p className="participant-label">{participant.label}</p>
            <h3>{participant.title}</h3>
            <p className="participant-description">{participant.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
