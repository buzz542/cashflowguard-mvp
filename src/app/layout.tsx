import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuardConstruct – Before you sign it, know what it means",
  description: "Take a photo of a construction contract, variation or site instruction. Get a plain-English explanation of what you’re agreeing to — including anything that could affect your payment. Built for small UK contractors. Not legal advice."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-[#FAFAF9] text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
