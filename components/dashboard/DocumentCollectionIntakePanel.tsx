'use client';

import type { DocumentCollectionIntakePrompt } from '@/lib/conviction/document-collection-intake';

type DocumentCollectionIntakePanelProps = {
  prompt: DocumentCollectionIntakePrompt;
  submissionUrl: string;
  candidateDocuments: string;
  submitting: boolean;
  onSubmissionUrlChange: (value: string) => void;
  onCandidateDocumentsChange: (value: string) => void;
  onSubmit: () => void;
};

export function DocumentCollectionIntakePanel({
  prompt,
  submissionUrl,
  candidateDocuments,
  submitting,
  onSubmissionUrlChange,
  onCandidateDocumentsChange,
  onSubmit,
}: DocumentCollectionIntakePanelProps) {
  return (
    <section
      className="rounded-[16px] border border-cyan-200/12 bg-cyan-300/[0.04] p-4"
      data-testid="document-collection-intake"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {prompt.heading}
      </p>
      <p className="mt-2 text-text-primary">{prompt.detail}</p>
      <p className="mt-2 text-text-secondary">{prompt.nextAction}</p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium text-text-primary">
          Submission link
          <input
            type="url"
            value={submissionUrl}
            onChange={(event) => onSubmissionUrlChange(event.target.value)}
            placeholder="https://..."
            className="rounded-[12px] border border-border bg-panel px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-300/40"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text-primary">
          Candidate documents / source bodies
          <textarea
            value={candidateDocuments}
            onChange={(event) => onCandidateDocumentsChange(event.target.value)}
            rows={4}
            placeholder="List each owned .docx, title/topic, or paste the source body notes."
            className="resize-none rounded-[12px] border border-border bg-panel px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-cyan-300/40"
          />
        </label>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="foldera-button-secondary w-full justify-center"
        >
          {submitting ? 'Saving inputs...' : 'Save inputs'}
        </button>
      </div>
    </section>
  );
}
