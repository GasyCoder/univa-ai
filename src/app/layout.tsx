import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const title = 'UNUVIA — AI Workspace for Universities';
const description =
  'UNUVIA is an AI workspace for universities, helping students, faculty, researchers, and staff access AI, institutional knowledge, and intelligent workflows in one secure platform.';

export const metadata: Metadata = {
  title,
  description,
  applicationName: 'UNUVIA',
  openGraph: {
    title,
    description,
    siteName: 'UNUVIA',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
  icons: { icon: '/assets/favicon.png' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
