import { start } from "@/components/docs/content/start";
import { build } from "@/components/docs/content/build";
import { trading } from "@/components/docs/content/trading";
import { makers } from "@/components/docs/content/makers";
import { operations } from "@/components/docs/content/operations";

export const pages = [...start, ...build, ...trading, ...makers, ...operations];
export const findPage = (slug: string) =>
  pages.find((page) => page.slug === slug);
