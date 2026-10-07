import { Barlow_Condensed, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './tokens.css';
import './globals.css';
import './ui.css';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Arial Narrow', 'Arial', 'sans-serif'],
});

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'Consolas', 'monospace'],
});

export const metadata = {
  title: 'ApparelFlow ERP - Cutting Gatekeeper',
  description: 'Cutting verification and sewing queue gate',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}