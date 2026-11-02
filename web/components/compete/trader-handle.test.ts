import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraderHandle } from "./trader-handle";

const { viewer } = vi.hoisted(() => ({
  viewer: { address: "wallet-a" as string | null, isConnected: true, initializing: false },
}));

vi.mock("@/hooks/use-wallet", () => ({ useWallet: () => viewer }));

function highlightedWallets() {
  return ["wallet-a", "wallet-b"].filter((wallet) => {
    const html = renderToStaticMarkup(createElement(TraderHandle, { wallet, handle: wallet, href: `/compete/${wallet}` }));
    return /class="[^"]*\btext-accent-text\b/.test(html);
  });
}

describe("leaderboard viewer highlight", () => {
  beforeEach(() => {
    Object.assign(viewer, { address: "wallet-a", isConnected: true, initializing: false });
  });

  it("highlights only the connected viewer's name", () => {
    expect(highlightedWallets()).toEqual(["wallet-a"]);
  });

  it("moves the highlight when the connected wallet changes", () => {
    expect(highlightedWallets()).toEqual(["wallet-a"]);
    viewer.address = "wallet-b";
    expect(highlightedWallets()).toEqual(["wallet-b"]);
  });

  it("does not highlight anyone when the viewer is not on the board", () => {
    viewer.address = "wallet-c";
    expect(highlightedWallets()).toEqual([]);
  });

  it("removes the highlight on disconnect even if an address remains", () => {
    viewer.isConnected = false;
    expect(highlightedWallets()).toEqual([]);
  });

  it("does not highlight anyone while the wallet is initializing", () => {
    viewer.initializing = true;
    expect(highlightedWallets()).toEqual([]);
  });

  it("does not highlight anyone without a wallet address", () => {
    viewer.address = null;
    expect(highlightedWallets()).toEqual([]);
  });
});
