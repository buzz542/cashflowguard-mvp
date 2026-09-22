import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuardConstruct – Before you sign it, know what it means",
  description:
    "Photograph or upload a construction contract. Get plain-English payment risks under English law. Built for small UK subcontractors and freelancers. Not legal advice."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-[#FAFAF9] text-gray-900 antialiased">{children}</body>
    </html>
  );
}
