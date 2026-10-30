import { cn } from "@/lib/utils";

/**
 * The size class for a tile value: 36 px on phones and 48 px from tablets up, stepping down as the string grows.
 * For server-rendered values; in the browser prefer FitValue, which measures its box and always shows the whole
 * number. The steps carry `!` because .t-value sits in the utilities layer too and would otherwise keep its own size.
 */
export function fitValueClass(text: string, base = "t-value"): string {
  const n = text.length;
  return cn(base, "num min-w-0 truncate", n > 9 ? "text-[22px]! md:text-[32px]!" : n > 7 ? "text-[26px]! md:text-[36px]!" : n > 5 ? "text-[30px]! md:text-[42px]!" : "");
}
