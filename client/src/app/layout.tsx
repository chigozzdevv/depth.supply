import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { GeistPixelSquare } from "geist/font/pixel";
import { site } from "@/shared/config/site";
import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: "Depth | Private perps. Shared depth.",
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Depth | Private perps. Shared depth.",
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Depth | Private perps. Shared depth.",
    description: site.description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
