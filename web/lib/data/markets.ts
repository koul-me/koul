import { hubName } from "@/lib/model/hubs";

/** The XOXNO testnet markets (configs/testnet/markets.json in XOXNO/rs-lending-xlm) and where each one lives on xoxno.com. */
export interface Market {
  /** Asset code as XOXNO names it. */
  name: string;
  /** Plain label with the hub, e.g. "USDC · Secondary USDC". */
  label: string;
  /** What the market trades, as people read it: "USDC", "XLM/USDC LP". */
  pair: string;
  hub: number;
  hubName: string;
  asset: string;
  decimals: number;
  /** The market page on the XOXNO testnet app. */
  url: string;
}

export const XOXNO_APP = "https://staging.xoxno.com";
// The hub's name is read when a label is drawn, so XOXNO's live names (lib/model/hubs.ts) apply once they load.
const market = (name: string, hub: number, asset: string, code = name): Market => ({ name, pair: code, get label() { return `${code} · ${hubName(hub)}`; }, hub, get hubName() { return hubName(hub); }, asset, decimals: 7, url: `${XOXNO_APP}/defi/lending/${asset}` });

export const MARKETS: Market[] = [
  market("USDC", 1, "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
  market("USDC_HUB2", 2, "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "USDC"),
  market("XLM", 1, "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"),
  market("EURC", 1, "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ"),
  market("BTC", 1, "CBK3FNAM3C54674OSOCQLDNW4EXMNUY6ZO3C3ZI5S5DGBIIPX4GJ7WHW"),
  market("ETH", 1, "CBFNIHC2B7WMAH2CKNKQJOB3CWBUXXNNRQXYISJ7VZONM77YBMHCOULJ"),
  market("XLMUSDC_LP", 3, "CDEUHPEUQAQNLCHFVBX3ZOSIR2FUWD2COYTSHUPQPJWK2BCLLQCW66FY", "XLM/USDC LP"),
];

export const marketUrl = (asset: string) => `${XOXNO_APP}/defi/lending/${asset}`;
