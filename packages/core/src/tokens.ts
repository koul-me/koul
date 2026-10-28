/**
 * Tokens a rule can price, hold and swap against USDC. Each has a Reflector feed registered on the router
 * (docs/build-log.md). Testnet carries several copies of most coins at made-up prices; these are the ones with a
 * Soroban route to USDC. `buys` is false where the testnet route pays under the Reflector price for a purchase, so the
 * router's floor refuses the buy; selling still works.
 */
export const SWAP_TOKENS = [
  { symbol: "XLM", name: "Stellar Lumens", id: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", decimals: 7, feed: "XLM", buys: true },
  { symbol: "ETH", name: "Ether", id: "CAEXCVZUCB6FGYKU6YAEUJMVCLS74SPSQ2TTEOLJ27A3C6C627OQON47", decimals: 7, feed: "ETH", buys: true },
  { symbol: "SOL", name: "Solana", id: "CBVJ6GYJJ55ALTHN32OJEFGUZWWTMDFGIBCM42SPYQ4GWLKX2XARAP2N", decimals: 7, feed: "SOL", buys: true },
  { symbol: "XRP", name: "XRP", id: "CBSUHSWWZS5MEAGET6ES7UWI5A4QEVABXP6XJXB4XIUMRKMBIN7MJZ5D", decimals: 7, feed: "XRP", buys: true },
  { symbol: "wBTC", name: "Wrapped Bitcoin", id: "CBWPLT4YJFXFNDCZFUMCZZQ7UBM2FDIAXQNCM24NZODJDSJNUNMQ63PF", decimals: 8, feed: "BTC", buys: true },
  { symbol: "BTC", name: "Bitcoin", id: "CAOWDS3FQ4RKAY3LP7EBRAN7QO2ZFPNXH2ITT47FSTEXPDZRNQHEQFS2", decimals: 7, feed: "BTC", buys: false },
  { symbol: "USDT", name: "Tether", id: "CDWFJXIZZFJ2CVGSAPZ5GWVEYCGDYE65XD2R7S4PWEDP2NFDWKNL4SWD", decimals: 7, feed: "USDT", buys: false },
  { symbol: "EURC", name: "Euro Coin", id: "CCIMRLN4JLJTGU62FG7IQUP4X5IIAFPBTJQ5AHBM7QQJDVXBJGN632PZ", decimals: 7, feed: "EURC", buys: false },
] as const;

/** USDC on testnet: the unit everything is valued in, worth $1 by definition. */
export const USDC_TESTNET = { symbol: "USDC", id: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", decimals: 7 } as const;
