/**
 * Server-rendered deploy fingerprint (Vercel injects VERCEL_GIT_COMMIT_SHA at build time).
 * Subtle fixed label for answering “is production on this commit?” without exposing debug UI.
 */
export function BuildMarker() {
  const full =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    '';
  const short = full ? full.slice(0, 7) : 'local';

  return (
    <div
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[90] select-none font-mono text-[10px] tabular-nums tracking-wide text-zinc-600/85"
      aria-hidden="true"
      data-build={short}
      title={full ? `Build ${full}` : 'Local development'}
    >
      {short}
    </div>
  );
}
