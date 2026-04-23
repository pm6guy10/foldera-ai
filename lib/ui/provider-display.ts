const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  azure_ad: 'Microsoft',
  'azure-ad': 'Microsoft',
  microsoft: 'Microsoft',
  google: 'Google',
  gmail: 'Gmail',
  outlook: 'Outlook',
  google_calendar: 'Google Calendar',
  outlook_calendar: 'Outlook Calendar',
  drive: 'Google Drive',
  onedrive: 'OneDrive',
  assistant_chat: 'Assistant Chat',
};

export function providerDisplayName(provider: string | null | undefined): string {
  if (!provider) return 'Unknown source';
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return 'Unknown source';

  const mapped = PROVIDER_DISPLAY_NAMES[normalized];
  if (mapped) return mapped;

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'No signal yet';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'No signal yet';

  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
