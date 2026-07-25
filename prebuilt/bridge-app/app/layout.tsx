import type { Metadata } from "next";
import "./globals.css";
import { AuthBootstrap } from "@/components/AuthBootstrap";

export const metadata: Metadata = {
  title: "Bridge — from breaking API change to reviewed PR",
  description:
    "Bridge turns a third-party API breaking change into a repo-specific, tested draft pull request and a shared migration room.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthBootstrap>{children}</AuthBootstrap>
      </body>
    </html>
  );
}
