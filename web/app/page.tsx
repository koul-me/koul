import { Landing } from "@/components/landing/landing";
import { ThemeColor } from "@/components/shell/theme-color";

/** The landing page. It never waits on the wallet; the app itself lives under /app. */
export default function Home() {
  return (
    <>
      <ThemeColor />
      <Landing />
    </>
  );
}
