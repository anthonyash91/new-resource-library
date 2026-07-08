import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getLocale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import { CrisisBar } from "@/components/CrisisBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { t } = createTranslator(locale);
  return {
    title: {
      default: t("meta.siteName"),
      template: `%s | ${t("meta.siteName")}`,
    },
    description: t("meta.tagline"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const { t } = createTranslator(locale);

  return (
    <html lang={locale}>
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
        >
          {t("nav.skipToMain")}
        </a>
        <CrisisBar labels={{
          label: t("crisis.label"),
          call988: t("crisis.call988"),
          textLine: t("crisis.textLine"),
        }} />
        <SiteHeader
          locale={locale}
          labels={{
            siteName: t("meta.siteName"),
            resources: t("nav.resources"),
            about: t("nav.about"),
            language: t("nav.language"),
            english: t("nav.english"),
            spanish: t("nav.spanish"),
          }}
        />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <SiteFooter t={t} />
      </body>
    </html>
  );
}
