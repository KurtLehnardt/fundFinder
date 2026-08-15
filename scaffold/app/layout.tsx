import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { SettingsPanelProvider } from "@/components/AppMenu";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["500", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Government Opportunity Finder",
  description: "Tell us about your company. We'll tell you what federal resources you should know about — and why.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body antialiased">
        {/*
          AuthProvider always wraps the app, flag or no flag. It is a passive
          React context — no network calls, no redirects, no rendered UI of its
          own — so mounting it unconditionally does not change v1 behavior.
          Whether any *visible* R9.0 surface (sign-in link, avatar, consent,
          delete-my-data) appears is decided per-component behind the
          `r9_0_mockauth` flag (see app/page.tsx, components/IntakeForm.tsx).
          Keeping the provider itself unconditional also means the real OAuth
          swap at R9 only has to change what's inside this file, not add it.

          SettingsPanelProvider (FE-06) is the same kind of always-on, no-UI-
          of-its-own context: it just makes the device-local Settings panel
          (Auto Apply requirements) reachable from anywhere in the tree —
          the hamburger menu (AppMenu) and the Auto Apply modal deep inside
          each OpportunityCard both open the same panel through it, without
          prop-drilling through OpportunityMap.
        */}
        <AuthProvider>
          <SettingsPanelProvider>{children}</SettingsPanelProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
