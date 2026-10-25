import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import Link from "next/link";

import "./globals.css";

// The landing's fonts; next/font serves them from the app itself, not from Google
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: "700",
});

export const metadata: Metadata = {
  // Absolute URLs in link preview tags (og:image) are built from this
  metadataBase: new URL("https://app.pmcrm.site"),
  title: {
    default: "Личная CRM",
    template: "%s — Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично",
  // Link preview: same texts as the landing's; the image is opengraph-image.png next to this file.
  // Pages below set only their title, so every page shares this preview
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Личная CRM",
    title: "Не теряйте людей, которых знаете лично",
    description:
      "Помогу вспомнить всё: кто это, откуда вы знакомы, как связаться и о чём договорились — всё в одной карточке.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${onest.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header>
          <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:h-20">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-logo focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:gap-3"
            >
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-logo bg-primary font-display text-logo-mark font-bold text-primary-foreground sm:size-9 sm:rounded-logo-lg sm:text-logo-mark-lg"
              >
                Л
              </span>
              <span className="text-logo font-medium sm:text-logo-lg">
                Личная CRM
              </span>
            </Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-2 pb-10 sm:pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
