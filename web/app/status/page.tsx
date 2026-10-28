import type { Metadata } from "next";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { StatusView } from "@/components/status/status-view";
import { ThemeColor } from "@/components/shell/theme-color";
import { publicStatus } from "@/lib/status-server";

export const metadata: Metadata = { title: "Status", description: "Whether Koul's keeper is running, and how busy it is." };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const s = await publicStatus().catch(() => null);
  return (
    <>
      <ThemeColor />
      <AutoRefresh />
      {s ? <StatusView s={s} now={s.readAt} /> : <main className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="t-title">Status is unavailable right now.</h1></main>}
    </>
  );
}
