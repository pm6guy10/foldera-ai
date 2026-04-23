import { FolderaMark } from '@/components/nav/FolderaMark';

export function BlogFooter() {
  return (
    <footer className="mt-16 border-t border-border-subtle py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 sm:px-6">
        <div className="flex items-center justify-center gap-3">
          <FolderaMark size="sm" decorative />
          <span className="text-base font-black uppercase tracking-[0.12em] text-text-primary">Foldera</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">
          <a href="/privacy" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 transition-colors hover:text-text-secondary">
            Privacy
          </a>
          <a href="/terms" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 transition-colors hover:text-text-secondary">
            Terms
          </a>
          <span>&copy; {new Date().getFullYear()} Foldera</span>
        </div>
      </div>
    </footer>
  );
}
