'use client';

import { useState } from 'react';
import type { ValidationResult, Violation, Warning } from '@/lib/grant/validator';
import type { ExtractedConstraints } from '@/lib/grant/types';
import type { NormalizedSpend } from '@/lib/grant/csv-ingest';

export default function GrantDemoPage() {
  const [letterText, setLetterText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<ExtractedConstraints | null>(null);
  const [spend, setSpend] = useState<NormalizedSpend | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  async function handleSubmit() {
    if (!csvFile) {
      setError('Please select a CSV file.');
      return;
    }
    setLoading(true);
    setError(null);
    setValidation(null);
    setSpend(null);
    setConstraints(null);

    try {
      const extractRes = await fetch('/api/extract-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: letterText }),
      });
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ error: extractRes.statusText }));
        setError(err.error || 'Extract failed');
        setLoading(false);
        return;
      }
      const extractedConstraints: ExtractedConstraints = await extractRes.json();
      setConstraints(extractedConstraints);

      const formData = new FormData();
      formData.append('csv', csvFile);
      formData.append('constraints', JSON.stringify(extractedConstraints));

      const validateRes = await fetch('/api/validate-budget', {
        method: 'POST',
        body: formData,
      });
      if (!validateRes.ok) {
        const err = await validateRes.json().catch(() => ({ error: validateRes.statusText }));
        setError(err.error || 'Validate failed');
        setLoading(false);
        return;
      }
      const { spend: spendData, validation: validationData } = await validateRes.json();
      setSpend(spendData);
      setValidation(validationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1>Grant compliance demo</h1>

      <div style={{ marginBottom: 16 }}>
        <label>
          Award letter text
          <textarea
            value={letterText}
            onChange={(e) => setLetterText(e.target.value)}
            style={{
              width: "100%",
              minHeight: "200px",
              padding: "12px",
              fontSize: "14px",
              backgroundColor: "#ffffff",
              color: "#111111",
              border: "1px solid #ccc",
              borderRadius: "6px"
            }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          CSV budget
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            style={{ display: 'block', marginTop: 4 }}
          />
        </label>
      </div>

      <button type="button" onClick={handleSubmit} disabled={loading} style={{ padding: '8px 16px' }}>
        {loading ? 'Submitting…' : 'Submit'}
      </button>

      {error && (
        <div style={{ marginTop: 16, color: 'red' }}>
          {error}
        </div>
      )}

      {validation && spend && constraints && (
        <div style={{ marginTop: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>

          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1f2937" }}>
            <p style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
              Compliance Report
            </p>
            <p style={{ fontSize: 15, color: "#94a3b8" }}>
              Total Award: ${constraints.total_award.toLocaleString()} · Generated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          <p style={{ fontSize: 17, color: "#f8fafc", marginBottom: 6 }}>
            Total Spent: <strong>${spend.totalSpent.toLocaleString()}</strong> / ${constraints.total_award.toLocaleString()}
          </p>

          <p style={{ fontSize: 16, fontWeight: 600, color: validation.compliant ? "#4ade80" : "#f87171", marginBottom: 20 }}>
            {validation.compliant ? "✓ Compliant" : "✗ Violations Found"}
          </p>

          {validation.violations.length > 0 && (
            <div style={{ background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: 20, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#f87171", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Violations ({validation.violations.length})
              </p>
              <p style={{ fontSize: 14, color: "#fca5a5", marginBottom: 14 }}>
                {validation.violations.length} issue{validation.violations.length > 1 ? "s" : ""} require attention before submission.
              </p>
              {validation.violations.map((v, i) => (
                <div key={i} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i < validation.violations.length - 1 ? "1px solid #3f0f0f" : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {v.code.replace(/_/g, " ")}
                  </span>
                  <p style={{ fontSize: 14, color: "#fca5a5", marginTop: 2 }}>{v.message}</p>
                </div>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div style={{ background: "#1a1200", border: "1px solid #78350f", borderRadius: 8, padding: 20, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Warnings ({validation.warnings.length})
              </p>
              <p style={{ fontSize: 14, color: "#fde68a", marginBottom: 14 }}>
                {validation.warnings.length} item{validation.warnings.length > 1 ? "s" : ""} flagged for review.
              </p>
              {validation.warnings.map((w, i) => (
                <div key={i} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i < validation.warnings.length - 1 ? "1px solid #3f2a00" : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {w.code.replace(/_/g, " ")}
                  </span>
                  <p style={{ fontSize: 14, color: "#fde68a", marginTop: 2 }}>{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {validation.compliant && (
            <div style={{ background: "#0a1f0a", border: "1px solid #14532d", borderRadius: 8, padding: 20, marginBottom: 16 }}>
              <p style={{ color: "#4ade80", fontWeight: 600 }}>
                ✓ No violations detected. Budget is compliant with grant constraints.
              </p>
            </div>
          )}

          <button
            onClick={() => {
              const report = {
                generated_at: new Date().toISOString(),
                total_award: constraints.total_award,
                total_spent: spend.totalSpent,
                compliant: validation.compliant,
                violations: validation.violations,
                warnings: validation.warnings,
                spend_by_category: spend.categories,
              };
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `grant-compliance-report-${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ marginTop: 8, padding: "10px 20px", background: "#0f172a", color: "#94a3b8", border: "1px solid #1f2937", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
          >
            Export Report JSON
          </button>

        </div>
      )}
    </div>
  );
}
