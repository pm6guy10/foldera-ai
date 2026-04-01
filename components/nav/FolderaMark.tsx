type FolderaMarkProps = {
  /** Outer box: sm = 36px (dashboard headers), md = 40px (marketing), lg = 48px (404 hero) */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const boxClass: Record<NonNullable<FolderaMarkProps['size']>, string> = {
  sm: 'h-9 w-9 rounded-xl bg-white/10 p-1',
  md: 'h-10 w-10 rounded-2xl bg-white/10 p-1.5',
  lg: 'h-12 w-12 rounded-2xl bg-white/10 p-2',
};

/**
 * PNG mark with a subtle frosted plate — foldera-icon.png has an opaque dark plate;
 * the container blends it into dark nav/footers.
 */
export function FolderaMark({ size = 'md', className = '' }: FolderaMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${boxClass[size]} ${className}`}
    >
      <img
        src="/foldera-icon.png"
        alt="Foldera"
        className="h-full w-full object-contain rounded-md"
        width={28}
        height={28}
      />
    </span>
  );
}
