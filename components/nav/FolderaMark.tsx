import Image from 'next/image';

type FolderaMarkProps = {
  /** Outer box: sm = 36px (dashboard headers), md = 40px (marketing), lg = 48px (404 hero) */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** When the adjacent link/text already names "Foldera", keep the glyph out of the accessibility tree. */
  decorative?: boolean;
};

const boxClass: Record<NonNullable<FolderaMarkProps['size']>, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

/**
 * Minimal brand glyph — transparent mark reads cleanly on dark chrome.
 */
export function FolderaMark({ size = 'md', className = '', decorative = false }: FolderaMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${boxClass[size]} ${className}`}
      aria-hidden={decorative ? true : undefined}
    >
      <Image
        src="/foldera-glyph.svg"
        alt={decorative ? '' : 'Foldera'}
        className="h-full w-full object-contain"
        width={28}
        height={28}
        unoptimized
      />
    </span>
  );
}
