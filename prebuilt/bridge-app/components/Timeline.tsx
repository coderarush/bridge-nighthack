import type { RunEventView } from "@/lib/types";

const stages = [
  {
    label: "Change detected",
    detail: "Provider contract comparison",
    matches: ["change.analysis.completed"],
  },
  {
    label: "Repository scanned",
    detail: "Bounded TypeScript discovery",
    matches: ["repo.scan.completed"],
  },
  {
    label: "Impacts identified",
    detail: "Guarded call-site matches",
    matches: ["repo.scan.completed"],
  },
  {
    label: "Migration plan created",
    detail: "Bounded plan ready for review",
    matches: ["plan.created"],
  },
  {
    label: "Patch committed",
    detail: "Bounded key rename",
    matches: ["github.branch.created"],
  },
  {
    label: "CI passed",
    detail: "Exact commit check",
    matches: ["validation.passed"],
  },
  {
    label: "Ready for review",
    detail: "Draft PR available",
    matches: ["run.ready_for_review"],
  },
];

export function Timeline({ events }: { events: RunEventView[] }) {
  const failedEvent = [...events].reverse().find((event) => event.status === "error");
  const completed = stages.map((stage) =>
    events.find((event) =>
      stage.matches.some((eventType) => event.eventType === eventType),
    ),
  );
  const firstPending = completed.findIndex((event) => !event);

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="panel-heading">
        <div>
          <p className="section-eyebrow">Run sequence</p>
          <h2 id="timeline-title">Migration timeline</h2>
        </div>
        <span className="timeline-progress">
          {completed.filter(Boolean).length}/{stages.length} complete
        </span>
      </div>

      {failedEvent ? (
        <div className="timeline-error" role="alert">
          <strong>{failedEvent.stage.replaceAll("_", " ")} failed</strong>
          <span>{failedEvent.message}</span>
        </div>
      ) : null}

      <ol className="timeline-list">
        {stages.map((stage, index) => {
          const event = completed[index];
          const isActive = !failedEvent && index === firstPending;
          const state = event ? "complete" : isActive ? "active" : "pending";

          return (
            <li className={`timeline-item timeline-item-${state}`} key={stage.label}>
              <span className="timeline-marker" aria-hidden="true">
                {event ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <div className="timeline-copy">
                <strong>{stage.label}</strong>
                <span>{event?.message ?? stage.detail}</span>
                {event ? (
                  <small className="mono">
                    {event.actorId ?? event.actorType} · {event.eventType}
                  </small>
                ) : null}
              </div>
              <span className={`timeline-state timeline-state-${state}`}>
                {event ? "Done" : isActive ? "Next" : "Waiting"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
