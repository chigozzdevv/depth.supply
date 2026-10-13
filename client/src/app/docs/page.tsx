import type { Metadata } from "next";
import { Article } from "@/components/docs/article";
import { pages } from "@/components/docs/content";

export const metadata: Metadata = {
  alternates: { canonical: "/docs" },
  openGraph: { title: "Documentation | Depth", url: "/docs" },
};

export default function DocsPage() {
  return <Article page={pages[0]} next={pages[1]} />;
}
