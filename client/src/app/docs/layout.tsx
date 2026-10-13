import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/docs/shell";
import { pages } from "@/components/docs/content";
import { searchEntries } from "@/components/docs/model";
import "@/components/docs/docs.css";

export const metadata: Metadata = {
  title: { default: "Documentation | Depth", template: "%s | Depth Docs" },
  description:
    "Integrate private perpetuals, supply liquidity, and run Depth on Solana.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  const navigation = pages.map(({ slug, title, group, sections }) => ({
    slug,
    title,
    group,
    sections: sections.map(({ id, title }) => ({ id, title })),
  }));
  return (
    <Shell pages={navigation} search={searchEntries(pages)}>
      {children}
    </Shell>
  );
}
