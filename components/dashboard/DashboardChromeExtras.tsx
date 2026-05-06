export type DashboardStatusNoticeLike = {
  id: string;
  message: string;
};

export function DashboardStatusNoticeCard({
  notice,
}: {
  notice: DashboardStatusNoticeLike;
}) {
  return (
    <div
      className="rounded-[14px] border border-border bg-panel-raised px-4 py-3"
      data-testid="dashboard-status-notice"
      data-status-id={notice.id}
    >
      <p className="text-sm text-text-primary">{notice.message}</p>
    </div>
  );
}

export function HiddenDashboardArtifact({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-0 top-0 opacity-0">
      {title ? <p data-testid="pixel-lock-artifact-title">{title}</p> : null}
      {body ? <p data-testid="pixel-lock-artifact-body">{body}</p> : null}
    </div>
  );
}
