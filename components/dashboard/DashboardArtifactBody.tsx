import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { DOCUMENT_MARKDOWN_COMPONENTS } from '@/app/dashboard/dashboard-page-model';

type DashboardArtifactBodyProps = {
  artifactBody: string;
  writeDocument: boolean;
  showArtifactBlur: boolean;
  onUpgrade: () => void;
};

function DashboardArtifactBodyContent({
  artifactBody,
  writeDocument,
}: Pick<DashboardArtifactBodyProps, 'artifactBody' | 'writeDocument'>) {
  return (
    <div
      data-testid="dashboard-document-body"
      className="foldera-dashboard-artifact-body max-h-[340px] overflow-y-auto pr-2 text-[15px] leading-7 text-text-secondary"
    >
      {writeDocument ? (
        <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
          {artifactBody}
        </ReactMarkdown>
      ) : (
        <div className="whitespace-pre-line">{artifactBody}</div>
      )}
    </div>
  );
}

export function DashboardArtifactBody({
  artifactBody,
  writeDocument,
  showArtifactBlur,
  onUpgrade,
}: DashboardArtifactBodyProps) {
  if (!showArtifactBlur) {
    return (
      <DashboardArtifactBodyContent artifactBody={artifactBody} writeDocument={writeDocument} />
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-[16px] border border-border bg-panel-raised p-4"
      data-testid="dashboard-pro-blur"
    >
      <div className="pointer-events-none select-none blur-[5px]">
        <DashboardArtifactBodyContent artifactBody={artifactBody} writeDocument={writeDocument} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/60 px-6 text-center">
        <p className="max-w-[280px] text-base font-medium text-text-primary">
          Upgrade to Pro to keep receiving finished work.
        </p>
        <button type="button" onClick={onUpgrade} className="foldera-button-primary mt-4">
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}
