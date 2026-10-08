'use client';

export function MobileNavigation({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <nav className="mobile-bottom-nav" aria-label={label}>
      {children}
    </nav>
  );
}
