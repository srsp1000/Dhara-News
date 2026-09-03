import { AuthProvider }    from "../components/auth/AuthContext";
import { ThemeProvider }   from "../components/ui/ThemeProvider";
import { LanguageProvider }from "../components/ui/LanguageSelector";
import ErrorBoundary       from "../components/ui/ErrorBoundary";
import Footer              from "../components/layout/Footer";
import "./globals.css";

export const viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "धारा News — Verified News, Curated for India",
  description: "India's most intelligent news platform. AI-verified with Truth Scores. Personalized for UPSC, Medical, Law, Tech professionals and students.",
  keywords: "India news, UPSC current affairs, verified news, fake news detection, breaking news India",
  manifest: "/manifest.json",
  openGraph: {
    title: "धारा News — Verified News for India",
    description: "Verified news with Truth Scores. Personalized feeds for 12 professions.",
    type: "website",
    siteName: "Dhara News",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e3a5f" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
              <Footer />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
              const disableSw = '${process.env.NODE_ENV}' !== 'production';
              if (disableSw) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
                if (window.caches) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                return;
              }
              navigator.serviceWorker.register('/sw.js');
            });
          }
        `}} />
      </body>
    </html>
  );
}
