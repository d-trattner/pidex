type HelpPopoverProps = {
  title: string;
  shows: string;
  source: string;
  reading: string;
  improve: string;
  caveats?: string;
};

export function HelpPopover({ title, shows, source, reading, improve, caveats }: HelpPopoverProps) {
  return (
    <details className="metric-help">
      <summary aria-label={`Explain ${title}`}>?</summary>
      <div className="metric-help__panel" role="note">
        <h4>{title}</h4>
        <dl>
          <dt>What this shows</dt>
          <dd>{shows}</dd>
          <dt>Data source</dt>
          <dd>{source}</dd>
          <dt>How to read it</dt>
          <dd>{reading}</dd>
          <dt>Improve it</dt>
          <dd>{improve}</dd>
          {caveats ? (
            <>
              <dt>Caveats</dt>
              <dd>{caveats}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </details>
  );
}
