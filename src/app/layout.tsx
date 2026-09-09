import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuardConstruct – Improve cash flow on every job",
  description: "First-pass commercial risk review of construction contracts under English law. Helps small firms and freelancers protect cash flow. Not legal advice."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}