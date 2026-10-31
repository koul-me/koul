import { TriangleAlert } from "lucide-react";
import { Tile } from "@/components/signal";

/** Said before a move that adds outside money while the wallet is in the competition: it takes the entry off the board. */
export function EntryWarning({ handle, what }: { handle: string; what: string }) {
  return (
    <Tile tone="outlined" className="flex items-start gap-3 border-danger p-4 md:p-5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <p className="text-[15px]">
        <b>You&apos;re in the competition as {handle}.</b> {what} counts as money added from outside, which takes your entry off the board.
      </p>
    </Tile>
  );
}
