"use client";

import { useEffect, useState } from 'react';

type EmailDraft = {
  id: string;
  draft: string;
  sender_email: string | null;
  sender_name: string | null;
  subject: string | null;
  created_at: string;
};

export default function InboxGuardPage() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/list-drafts');
      if (!res.ok) {
        throw new Error('Failed to load drafts');
      }
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(id: string, override?: string) {
    setActioningId(id);
    try {
      const res = await fetch('/api/send-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, draft: override }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send draft');
      }
      await loadDrafts();
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to send draft');
    } finally {
      setActioningId(null);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editValue.trim()) {
      setError('Draft cannot be empty');
      return;
    }
    setActioningId(id);
    try {
      const res = await fetch('/api/list-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, draft: editValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update draft');
      }
      await loadDrafts();
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update draft');
    } finally {
      setActioningId(null);
    }
  }

  async function handleDecline(id: string) {
    setActioningId(id);
    try {
      const res = await fetch('/api/list-drafts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete draft');
      }
      await loadDrafts();
    } catch (err: any) {
      setError(err.message || 'Failed to delete draft');
    } finally {
      setActioningId(null);
    }
  }

  function startEditing(draft: EmailDraft) {
    setEditingId(draft.id);
    setEditValue(draft.draft);
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/scan-inbox', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to scan inbox');
      }
      await loadDrafts();
    } catch (err: any) {
      setError(err.message || 'Failed to scan inbox');
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="min-h-screen p-6 pb-24 space-y-6 lg:max-w-4xl lg:mx-auto">
      <div className="space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="glow-text text-3xl font-bold">Inbox Guard</h1>
          <p className="text-gray-400">
            Review, edit, and approve AI-generated replies before they go out.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn w-full sm:w-auto" onClick={handleScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan inbox now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card-enhanced border border-red-500/40 text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card-enhanced text-center">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="card-enhanced text-center text-gray-400">
          No drafts waiting. You’re fully covered.
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const isEditing = editingId === draft.id;
            const isBusy = actioningId === draft.id;
            const sender = draft.sender_name || draft.sender_email || 'Unknown sender';
            const subject = draft.subject || '(no subject)';

            return (
              <div key={draft.id} className="card-enhanced space-y-4">
                <div>
                  <p className="text-sm text-gray-400">{new Date(draft.created_at).toLocaleString()}</p>
                  <h2 className="text-xl font-semibold">{subject}</h2>
                  <p className="text-gray-300">From {sender}</p>
                </div>

                {isEditing ? (
                  <textarea
                    className="w-full rounded-lg bg-slate-900/40 border border-slate-700 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={6}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap bg-slate-900/40 border border-slate-800 rounded-lg p-4 text-sm">
                    {draft.draft}
                  </pre>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    className="btn flex-1"
                    disabled={isBusy}
                    onClick={() =>
                      isEditing ? handleSend(draft.id, editValue) : handleSend(draft.id)
                    }
                  >
                    {isBusy ? 'Sending…' : 'Approve & Send'}
                  </button>
                  {isEditing ? (
                    <>
                      <button
                        className="btn-secondary flex-1"
                        disabled={isBusy}
                        onClick={() => handleSaveEdit(draft.id)}
                      >
                        {isBusy ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        className="btn-secondary flex-1"
                        onClick={() => setEditingId(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-secondary flex-1"
                      disabled={isBusy}
                      onClick={() => startEditing(draft)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    className="btn-outline flex-1"
                    disabled={isBusy}
                    onClick={() => handleDecline(draft.id)}
                  >
                    {isBusy ? 'Removing…' : 'Decline'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}


