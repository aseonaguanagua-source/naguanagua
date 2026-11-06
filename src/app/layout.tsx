import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IAMEC Naguanagua",
  description: "Sistema Integral de Recaudación Tributaria Municipal para el Municipio Naguanagua.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logos/logo_global_rec.png",
    apple: "/logos/logo_global_rec.png",
  },
  openGraph: {
    title: "IAMEC Naguanagua",
    description: "Accede al Sistema Integral de Recaudación Tributaria Municipal del Municipio Naguanagua. Autogestión en línea para contribuyentes y operadores.",
    url: "https://naguanagua.globalgreenrec.com",
    siteName: "IAMEC Naguanagua",
    locale: "es_VE",
    type: "website",
  }
};

import TextosEditables from '@/components/TextosEditables';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import TestModeBanner from '@/components/TestModeBanner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${poppins.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme_mode');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#f8fafc] transition-colors duration-200" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>
        <TestModeBanner />
        {children}
        <TextosEditables />
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
