import { Demo } from "@/components/demo/entry";
import { demoConfig } from "@/shared/config/runtime";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Maker | Depth",
  alternates: { canonical: "/demo/maker" },
};
export default function MakerPage() {
  return <Demo role="maker" config={demoConfig()} />;
}
