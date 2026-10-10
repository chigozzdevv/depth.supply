import { Demo } from "@/components/demo/entry";
import { demoConfig } from "@/shared/config/runtime";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trade | Depth",
  alternates: { canonical: "/demo/trade" },
};
export default function TradePage() {
  return <Demo role="trade" config={demoConfig()} />;
}
