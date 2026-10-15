# Market risk and Hub walking — v169

The ordinary hourly max/min range at stockVolatility 1 is calibrated to about 5%, replacing v165's approximately 12%. This is a sample median, not a ceiling or an annualized statistical volatility. News can produce larger moves. Existing per-stock volatility settings still scale motion; no world configuration is rewritten.

The reference price now moves with neutral random sentiment and reference noise. Unscheduled news shifts both the quote and its reference in either direction; the old reference is not a guaranteed destination. News arrivals average once per four hours per stock, with log-price shifts of 2.5–7.5% at standard volatility. Signs are symmetric, and there is no fixed bullish term. Short-term reversion remains around the **current** reference, with a three-minute half-life. The technical positive price floor remains 0.01. There are no artificial price ceilings or hourly resets. This deliberately increases holding risk and removes the old guaranteed-looking fixed-band recovery; it does not guarantee that any strategy loses or that long holding is profitable/unprofitable.

Existing prices and stored references are used without an entry-price reset. The moving reference is persisted through the existing SQLite anchor field and legacy quote JSON. The same ES5 model remains named `stock-motion-v165.js` for deployment compatibility; its exported version is 169. The isolated service's exact DM impulses and end-of-impulse re-anchoring remain in its adapter. Existing legacy DM impulse behavior is unchanged. No schema migration is needed.

## Measured sample

`node tests/market-risk-v169.mjs` uses 24 fixed seeds × 24 hours per model: 576 hourly windows, initial price 100, ten-second ticks, standard volatility.

| Measurement | v165 | v169 |
| --- | ---: | ---: |
| Median hourly max/min range | 11.9854% | 5.0428% |
| Hourly range 10th–90th percentile | 9.5114–15.0769% | 3.8820–9.3711% |
| Median 24-hour holding change | +0.0452% | −0.9896% |
| Worst/best 24-hour holding change | −6.5906 / +7.4400% | −21.2984 / +20.1565% |

A deliberately simple fixed-band strategy buys whole shares with available cash below 98 and sells above 101, with no leverage, fees or lookahead. Remaining positions are marked to the last quote. It loses in 4 of the 24 new-model runs, versus 0 previously; its worst new endpoint is −14.9392%, and its largest intraday equity drawdown is 23.5226% (previously 8.6549%). Its median endpoint remains positive (+12.1224%), so this sample is **not** proof of a fair market, an optimal strategy, or permanent balance. The test is evidence that the old recovery assumption can now fail. Retest against player behavior after deployment.

The same sample observes 143 news events: 67 upward and 76 downward. One-second and ten-second drivers are checked for comparable distributions, not identical noise paths. Restart/chunk replay equality, positive prices, legacy initialization and model mirrors are tested. A week can end substantially outside the starting band in either direction.

## Leverage accounting

Quantity means shares/exposure. Leverage divides required collateral; it does not multiply the profit on those shares again. At price 100, collateral 1,000 buys 10 shares at ×1, 20 at ×2, or 30 at ×3. A favorable price change of 10 yields 100 / 200 / 300 respectively. The same **10 shares** yield 100 at all three leverage settings while tying up different collateral. The close selector does not alter the leverage of an existing position.

Tests verify equal-collateral gains/losses, partial/full closes, fixed-share profit, mixed entry leverage and old positions across isolated SQLite, JSON sync and PocketBase JS backends. Closing ledger metadata now reflects effective stored leverage. Legacy backends also write actual collateral, cash flow and realized P/L (including liquidations); old ledger rows are not rewritten. Additional buys preserve the collateral of old all-cash positions that lack an explicit margin field. Portfolio long valuation now shows remaining equity rather than including borrowed exposure; unrealized profit remains based on shares × price change. Localized order labels and an example explain the units.

## Hub movement

The web's optimistic write queue rebuilt the active screen after each confirmed save. Once Hub became a common navigation route, that rebuild cancelled the remaining walk. Hub mutations now opt out of whole-screen optimistic/success/failure redraws; other writes retain the default behavior. The runtime keeps the same map while saving and animating each step. A failed save still rolls the step back and stops at the last confirmed position. New full-web coverage runs the real mutation bridge and queued writes, rather than a replacement commit callback, and verifies five adjacent saved steps after one click plus a mid-route save failure.

## Deployment

Apply and test the source update locally, then use Deploy Web for the web assets. The renderer changes require the updated desktop source/bundle. Installer version stays 1.0.155; no installer release is included.

For the isolated service, replace these **two files together**:

- `market-service/server.js` → `/opt/grpgi-market-service/server.js`
- `market-service/stock-motion-v165.js` → `/opt/grpgi-market-service/stock-motion-v165.js`

```bash
node --check /opt/grpgi-market-service/server.js
node --check /opt/grpgi-market-service/stock-motion-v165.js
sudo systemctl restart grpgi-market
sudo systemctl status grpgi-market --no-pager
```

Keep all databases. When the isolated service is active, PocketBase/worker need no restart for this model update. If running the PocketBase-hook backend instead, replace `grpgi_stock_exchange_v148.js` and its adjacent `stock-motion-v165.js` in the deployed `pb_hooks` folder and restart PocketBase. For the JSON sync backend, replace `stock-exchange-v148.js` plus adjacent `stock-motion-v165.js`, then restart its existing process. Update only the active backend; do not start a second price generator.

No production deployment or original-user-data tests were performed. Native live PocketBase and native Electron installer execution were not exercised; PocketBase math/state was tested in its JS module and the isolated service against temporary real SQLite databases.
