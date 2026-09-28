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
  openGraph: {
    title: "IAMEC Naguanagua",
    description: "Accede al Sistema Integral de Recaudación Tributaria Municipal del Municipio Naguanagua. Autogestión en línea para contribuyentes y operadores.",
    url: "https://aseonaguanagua.globalrecca.com",
    siteName: "IAMEC Naguanagua",
    locale: "es_VE",
    type: "website",
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f8fafc]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
