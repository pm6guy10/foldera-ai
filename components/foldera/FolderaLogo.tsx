import Link from 'next/link';
import { FolderaMark } from '@/components/nav/FolderaMark';

type FolderaLogoProps = {
  href?: string;
  markSize?: 'sm' | 'md' | 'lg';
  wordmarkClassName?: string;
  className?: string;
};

export function FolderaLogo({
  href = '/',
  markSize = 'md',
  wordmarkClassName = '',
  className = '',
}: FolderaLogoProps) {
  const content = (
    <>
      <FolderaMark size={markSize} decorative />
      <span className={`text-[15px] font-semibold tracking-[-0.03em] text-text-primary ${wordmarkClassName}`}>
        Foldera
      </span>
    </>
  );

  if (!href) {
    return <span className={`inline-flex items-center gap-3 ${className}`}>{content}</span>;
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-[14px] text-text-primary transition-opacity hover:opacity-95 ${className}`}
    >
      {content}
    </Link>
  );
}
