import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuardConstruct – Payment Trap Checker for Small UK Construction Firms",
  description: "Free first-pass commercial risk review of construction contracts under English law. Spot payment traps before you sign. Not legal advice."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="font-bold text-lg tracking-tight">
              Guard<span className="text-blue-600">Construct</span>
            </div>
            <div className="text-xs text-gray-500">English law • Under 25 staff</div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 pb-20">{children}</main>
        <footer className="border-t py-6 text-center text-xs text-gray-500 px-4">
          <p className="font-semibold text-gray-700 mb-1">IMPORTANT DISCLAIMER</p>
          <p>
            Commercial risk identification only. Not legal advice. Not a solicitor.
            High-value contracts should still go to a specialist. Data is not used for model training.
          </p>
        </footer>
      </body>
    </html>
  );
}