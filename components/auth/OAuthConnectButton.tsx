import React from 'react';

export type FolderaOAuthProvider = 'google' | 'azure-ad';

export function OAuthConnectButton({
  label,
  provider,
  loadingProvider,
  onClick,
  href,
}: {
  label: string;
  provider: FolderaOAuthProvider;
  loadingProvider?: string | null;
  onClick?: (provider: FolderaOAuthProvider) => void;
  href?: string;
}) {
  const loading = loadingProvider === provider;
  const content = (
    <>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] group-hover:animate-shimmer" />
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : provider === 'google' ? (
        <GoogleIcon />
      ) : (
        <MicrosoftIcon />
      )}
      <span>{label}</span>
    </>
  );

  const className = `relative inline-flex foldera-touch-height w-full items-center justify-center gap-3 foldera-button-radius px-4 text-xs font-black uppercase tracking-[0.14em] transition-all duration-300 disabled:cursor-wait disabled:opacity-50 overflow-hidden group border ${
    provider === 'google'
      ? 'bg-accent/10 border-accent/20 text-accent hover:bg-accent/20 hover:border-accent/40 shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:shadow-[0_0_25px_rgba(34,211,238,0.2)]'
      : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20'
  }`;

  if (href) {
    return (
      <a href={href} className={className} aria-label={label}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(provider)}
      disabled={Boolean(loadingProvider)}
      className={className}
      aria-label={label}
    >
      {content}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
