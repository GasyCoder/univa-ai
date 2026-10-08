'use client';
import { ThemeProvider as Provider, useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </Provider>
  );
}
export function ThemeToggle({
  label,
  className = '',
  onThemeChange,
}: {
  label?: string;
  className?: string;
  onThemeChange?: (theme: 'light' | 'dark') => void | Promise<void>;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`theme-toggle ${className}`}
      aria-label="Toggle light or dark mode"
      onClick={() => {
        const theme = resolvedTheme === 'dark' ? 'light' : 'dark';
        setTheme(theme);
        void onThemeChange?.(theme);
      }}
    >
      <Sun className="theme-sun" size={18} />
      <Moon className="theme-moon" size={18} />
      {label && <span>{label}</span>}
    </Button>
  );
}
