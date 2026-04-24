import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "[extract] — URL Scraper",
  description:
    "Fetch any URL and get clean Markdown or plain text with no HTML noise.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
