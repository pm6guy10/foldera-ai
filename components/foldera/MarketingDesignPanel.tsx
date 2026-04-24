import { FolderaLogo } from '@/components/foldera/FolderaLogo';

const palette = [
  { label: 'bg', value: '#07090D', className: 'bg-[#07090d]' },
  { label: 'surface', value: '#0B0F14', className: 'bg-[#0b0f14]' },
  { label: 'surface-2', value: '#121820', className: 'bg-[#121820]' },
  { label: 'border', value: '#1B2530', className: 'bg-[#1b2530]' },
  { label: 'accent', value: '#22D3EE', className: 'bg-[#22d3ee]' },
  { label: 'accent-2', value: '#0EA5E9', className: 'bg-[#0ea5e9]' },
  { label: 'success', value: '#22C55E', className: 'bg-[#22c55e]' },
  { label: 'warning', value: '#F59E0B', className: 'bg-[#f59e0b]' },
  { label: 'text', value: '#E6E8EB', className: 'bg-[#e6e8eb]' },
  { label: 'muted', value: '#7A8594', className: 'bg-[#7a8594]' },
];

const iconLabels = ['↗', '⌁', '▣', '✦', '◐', '◌', '⟲', '◦'];

export function MarketingDesignPanel() {
  return (
    <aside className="foldera-panel sticky top-24 overflow-hidden">
      <div className="border-b border-border px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Foldera Design System
        </p>
      </div>

      <div className="divide-y divide-border">
        <section className="px-4 py-4">
          <p className="foldera-eyebrow">01. Logo</p>
          <FolderaLogo href="" markSize="sm" className="mt-4" wordmarkClassName="text-[17px]" />
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">02. Color Palette</p>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {palette.map((swatch) => (
              <div key={swatch.label} className="space-y-2">
                <div className={`h-10 rounded-[10px] border border-white/8 ${swatch.className}`} />
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">{swatch.label}</p>
                  <p className="text-[10px] text-text-muted">{swatch.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">03. Typography</p>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
            <span className="text-[54px] font-semibold tracking-[-0.06em] text-text-primary">Aa</span>
            <div className="space-y-2">
              <p className="text-[22px] font-semibold tracking-[-0.04em] text-text-primary">Inter</p>
              <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                <span>H1 38/44</span>
                <span>H2 24/32</span>
                <span>Body 16/24</span>
                <span>Body 2 14/20</span>
                <span>Caption 12/16</span>
                <span>Label 11/14</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">04. Buttons</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <span className="foldera-button-primary">Start free →</span>
              <span className="foldera-button-secondary">See example brief</span>
            </div>
            <span className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] px-4 text-sm text-accent">
              View pricing →
            </span>
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">05. Icon Set</p>
          <div className="mt-4 flex flex-wrap gap-3 text-[18px] text-text-secondary">
            {iconLabels.map((label) => (
              <span
                key={label}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised"
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">06. Radius Scale</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {['xs 4px', 'sm 8px', 'md 12px', 'lg 16px', 'xl 20px', '2xl 28px'].map((item) => (
              <span key={item} className="rounded-[12px] border border-border bg-panel-raised px-3 py-3 text-center">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">07. Spacing Scale</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {['4', '8', '12', '16', '24', '32', '40', '64', '96'].map((item) => (
              <span key={item} className="rounded-[12px] border border-border bg-panel-raised px-3 py-2">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow">08. Accent Glow</p>
          <div className="mt-4 h-14 rounded-[16px] border border-border bg-[#09111a]">
            <div className="mx-auto mt-8 h-px w-4/5 bg-gradient-to-r from-transparent via-cyan-300 to-purple-500 blur-[1px]" />
          </div>
        </section>

        <section className="px-4 py-4">
          <p className="foldera-eyebrow text-cyan-400">09. Do Not Use</p>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[10px] text-text-muted">
            {['Heavy gradients', 'Glow blobs', '3D skeuomorph', 'Busy backgrounds'].map((item, index) => (
              <div key={item} className="space-y-2">
                <div className={`h-10 rounded-[12px] border border-red-400/30 ${index === 0 ? 'bg-[linear-gradient(135deg,#ff6b6b,#7c3aed)]' : index === 1 ? 'bg-[radial-gradient(circle,#22d3ee,#7c3aed,#111827)]' : index === 2 ? 'bg-[linear-gradient(135deg,#111827,#334155)]' : 'bg-[linear-gradient(135deg,#111827,#4b5563)]'}`} />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
