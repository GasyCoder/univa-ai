import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { SITE } from '@/lib/site';
import './globals.css';

const interfaceFont = localFont({
  src: '../../public/fonts/inter-variable.woff2',
  variable: '--font-interface',
  weight: '100 900',
  display: 'swap',
});
const headingFont = localFont({
  src: '../../public/fonts/manrope-variable.woff2',
  variable: '--font-heading-family',
  weight: '200 800',
  display: 'swap',
});

const title = 'UNUVIA | AI Workspace for Universities';
const description =
  'UNUVIA is an AI workspace for universities. Students, faculty, researchers and staff ask questions, analyze documents and draft their work with Claude.';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL || SITE.url),
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
    <html
      lang="en"
      className={`${interfaceFont.variable} ${headingFont.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton mobileOffset={{ bottom: 88 }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
