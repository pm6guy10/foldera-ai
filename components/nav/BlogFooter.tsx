import { FolderaMark } from '@/components/nav/FolderaMark';

export function BlogFooter() {
  return (
    <footer className="border-t border-white/5 py-12 mt-16">
      <div className="max-w-4xl mx-auto px-6 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center gap-3">
          <FolderaMark />
          <span className="text-lg font-black tracking-tighter text-white uppercase">Foldera</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
        <a href="/privacy" className="hover:text-zinc-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">
          Privacy
        </a>
        <a href="/terms" className="hover:text-zinc-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">
          Terms
        </a>
        <span className="text-zinc-700">&copy; {new Date().getFullYear()} Foldera</span>
        </div>
      </div>
    </footer>
  );
}
