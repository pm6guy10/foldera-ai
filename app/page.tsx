export default function HomePage() {
  return (
    <div style={{ background: "#0f172a", color: "#f8fafc" }} className="antialiased min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#1f2937] bg-[#0f172a]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0f172a]/80">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" aria-label="Foldera home" style={{ color: "#f8fafc" }}>
            <img src="/foldera-glyph.svg" alt="" width={28} height={28} />
            <span className="text-lg font-semibold">Foldera</span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/api/auth/signin"
              className="text-sm font-medium transition-colors"
              style={{ color: "#94a3b8" }}
            >
              Login
            </a>
            <a
              href="/instant-audit"
              className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
              style={{ background: "#f8fafc", color: "#0f172a" }}
            >
              Start Free Trial
            </a>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px", textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <h1 style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2, marginBottom: 20, color: "#f8fafc" }}>
          Catch grant compliance issues before your auditor does.
        </h1>

        <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
          Paste your grant award letter. Upload your budget spreadsheet.
          Foldera flags cap overruns, percentage violations, restricted spending,
          and unrecognized categories in seconds.
        </p>

        <p style={{ fontSize: 15, color: "#475569", marginBottom: 40 }}>
          No account required. No OAuth. Paste two documents, get your compliance report.
        </p>

        <a
          href="/grant-demo"
          style={{
            display: "inline-block",
            background: "#f8fafc",
            color: "#0f172a",
            padding: "14px 32px",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 16,
            textDecoration: "none",
          }}
        >
          Run the compliance check →
        </a>

        <div style={{ marginTop: 80, textAlign: "left", borderTop: "1px solid #1f2937", paddingTop: 48 }}>
          <h2 style={{ fontSize: 22, marginBottom: 24, color: "#f8fafc" }}>What it checks</h2>
          <div style={{ display: "grid", gap: 16 }}>
            {[
              ["Total award exceeded", "Flags when cumulative spend crosses the grant ceiling."],
              ["Category cap violations", "Catches line items that exceed the funder's approved budget caps."],
              ["Percentage cap violations", "Enforces percentage limits like 'indirect costs not to exceed 10%'."],
              ["Restricted categories", "Detects prohibited spending like lobbying or political activity."],
              ["Unrecognized categories", "Warns on spend categories not defined in the award letter."],
            ].map(([title, desc]) => (
              <div key={title} style={{ padding: 20, background: "#111827", border: "1px solid #1f2937", borderRadius: 8 }}>
                <p style={{ fontWeight: 600, marginBottom: 4, color: "#f8fafc" }}>{title}</p>
                <p style={{ color: "#94a3b8", fontSize: 14 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 64, borderTop: "1px solid #1f2937", paddingTop: 48 }}>
          <p style={{ color: "#475569", fontSize: 14 }}>
            Built for nonprofit program directors, grants managers, and finance teams
            who want to catch problems before the auditor does.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6" style={{ borderTop: "1px solid #1f2937" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/foldera-glyph.svg" alt="" width={24} height={24} />
            <span className="text-sm font-semibold" style={{ color: "#f8fafc" }}>Foldera</span>
          </div>
          <div className="text-sm" style={{ color: "#475569" }}>© {new Date().getFullYear()} Foldera.</div>
          <div className="flex gap-6 text-sm">
            <a href="#" className="transition-colors" style={{ color: "#475569" }}>Privacy</a>
            <a href="#" className="transition-colors" style={{ color: "#475569" }}>Terms</a>
            <a href="#" className="transition-colors" style={{ color: "#475569" }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
