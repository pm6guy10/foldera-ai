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
        <div style={{ marginTop: 24, fontFamily: "monospace" }}>

          <p style={{ fontSize: 18, marginBottom: 8 }}>
            Total Spent: ${spend.totalSpent.toLocaleString()} / ${constraints.total_award.toLocaleString()}
          </p>

          <p style={{
            fontSize: 20,
            fontWeight: "bold",
            color: validation.compliant ? "green" : "red",
            marginBottom: 16
          }}>
            {validation.compliant ? "✅ COMPLIANT" : "🚨 VIOLATIONS FOUND"}
          </p>

          {validation.violations.length > 0 && (
            <div style={{
              background: "#2a0a0a",
              border: "1px solid #ff4444",
              borderRadius: 6,
              padding: 16,
              marginBottom: 16
            }}>
              <p style={{ color: "#ff4444", fontWeight: "bold", marginBottom: 8 }}>
                VIOLATIONS ({validation.violations.length})
              </p>
              {validation.violations.map((v, i) => (
                <div key={i} style={{ color: "#ff6666", marginBottom: 6 }}>
                  <strong>{v.code}</strong>: {v.message}
                </div>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div style={{
              background: "#1a1200",
              border: "1px solid #ffaa00",
              borderRadius: 6,
              padding: 16,
              marginBottom: 16
            }}>
              <p style={{ color: "#ffaa00", fontWeight: "bold", marginBottom: 8 }}>
                WARNINGS ({validation.warnings.length})
              </p>
              {validation.warnings.map((w, i) => (
                <div key={i} style={{ color: "#ffcc44", marginBottom: 6 }}>
                  <strong>{w.code}</strong>: {w.message}
                </div>
              ))}
            </div>
          )}

          {validation.compliant && (
            <div style={{
              background: "#0a2a0a",
              border: "1px solid #44ff44",
              borderRadius: 6,
              padding: 16,
              marginBottom: 16
            }}>
              <p style={{ color: "#44ff44", fontWeight: "bold" }}>
                ✅ No violations or warnings. Budget is compliant with grant constraints.
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
              const blob = new Blob([JSON.stringify(report, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `grant-compliance-report-${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              background: "#1a1a2e",
              color: "#ffffff",
              border: "1px solid #444",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 14,
            }}
          >
            Export Report JSON
          </button>

        </div>
      )}
    </div>
  );
}
