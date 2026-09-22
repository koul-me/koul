/**
 * Balance history and PnL from what the wallet already knows, with no indexer. The total balance (idle + supplied
 * − debt) only changes when money enters or leaves the wallet, or through interest: supplying, withdrawing and
 * repaying move money inside it. So the deposits and sends draw the line, and PnL is today's balance minus what
 * came in net: interest is the gap. The node keeps a limited window of events; `since` says where it starts.
 */
export interface Flow { at: number; amount: number }
export interface HistoryPoint { t: number; v: number }
export interface BalanceHistory {
  series: HistoryPoint[];
  /** Today's balance minus money in net of money out; null when the history does not reach the wallet's start. */
  pnl: number | null;
  /** PnL over what was deposited, in percent; null without a PnL or with nothing deposited. */
  pnlPct: number | null;
  /** Deposits minus sends in the window. */
  netIn: number;
}

/**
 * `flows` are signed USDC from the wallet's side (+ in, − out), in any order. `complete` says the events reach back
 * to the wallet's creation, so it started at 0: the line is built forward from 0, and the rise to today's balance
 * after the last flow is interest, which is the PnL. Without that, the start is unknown: the line is walked back
 * from today and there is no PnL.
 */
export function balanceHistory(flows: Flow[], current: number, since: number, complete: boolean, now: number = Date.now()): BalanceHistory {
  const inWindow = flows.filter((f) => f.at >= since && f.at <= now);
  const netIn = inWindow.reduce((s, f) => s + f.amount, 0);
  const deposited = inWindow.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const points: HistoryPoint[] = [];
  if (complete) {
    let v = 0;
    points.push({ t: since, v });
    for (const f of [...inWindow].sort((a, b) => a.at - b.at)) {
      points.push({ t: f.at - 1, v });
      v += f.amount;
      points.push({ t: f.at, v });
    }
    points.push({ t: now, v: current });
  } else {
    let v = current;
    const back: HistoryPoint[] = [{ t: now, v }];
    for (const f of [...inWindow].sort((a, b) => b.at - a.at)) {
      back.push({ t: f.at, v });
      v -= f.amount;
      back.push({ t: f.at - 1, v });
    }
    back.push({ t: since, v });
    points.push(...back.reverse());
  }
  const series = points.filter((p, i, all) => i === 0 || p.t > all[i - 1]!.t).map((p) => ({ t: p.t, v: Math.max(0, p.v) }));
  const pnl = complete ? current - netIn : null;
  return { series, pnl, pnlPct: pnl !== null && deposited > 0 ? (pnl / deposited) * 100 : null, netIn };
}

/** The part of the series inside the last `days`, starting from the balance at that moment. */
export function lastDays(series: HistoryPoint[], days: number | null, now: number = Date.now()): HistoryPoint[] {
  if (days === null || series.length === 0) return series;
  const from = now - days * 86_400_000;
  const before = [...series].reverse().find((p) => p.t <= from);
  const inside = series.filter((p) => p.t > from);
  // Nothing before the range: the wallet is younger than it, so the line starts flat at its first value.
  return [{ t: from, v: before ? before.v : inside[0]?.v ?? 0 }, ...inside];
}
