'use client';

export function MobileNavigation({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t bg-background px-2 pt-2 lg:hidden"
      aria-label={label}
    >
      {children}
    </nav>
  );
}
