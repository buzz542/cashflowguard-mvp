import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuardConstruct — Before you sign it, know what it means",
  description:
    "Photograph or upload a construction contract. Get an automated AI summary of payment risks under English law. Built for small UK subcontractors and freelancers. Not legal advice."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="antialiased bg-[#FAFAF9] text-gray-900">{children}</body>
    </html>
  );
}
