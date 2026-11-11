# Google Play Billing

Nothing in this repo charges a card. The web build never loads the purchase UI. The Android app does, through the PlayBilling Capacitor plugin.

## Products

| Product id | Kind | Price (US, before local prices) | What it does |
|---|---|---|---|
| `pro_unlock` | Non-consumable | $2.99 | Unlocks Pro on devices signed in to the same Google account. |
| `tip_small` | Consumable | $0.99 | A tip. Unlocks nothing. Can be bought again. |
| `tip_medium` | Consumable | $2.99 | A tip. Unlocks nothing. Can be bought again. |
| `tip_large` | Consumable | $4.99 | A tip. Unlocks nothing. Can be bought again. |

`supporter_badge` is retired. Don't sell it in the new listing. Anyone who already owns Pro keeps Pro. A tip never grants or revokes Pro, and the app does not keep a badge or a tip count.

Prices on the buttons are the localized strings Play returns. The app does not invent a price.

## Where it shows up

- Web and the installed page: Preview Pro stays as it is. Tip buttons are not in the page.
- Android, calculator: Preview Pro is hidden. **Get Pro** and **Restore purchases** sit with the labs. No tip buttons there.
- Android, Settings: a **Leave a tip** section with the three tips and Restore. No Get Pro button, and it stays hidden on the web.
- Android, planner: Preview Pro is hidden. The extras point at Get Pro in Settings. Buying still happens through the same plugin.

Pro gating for labs, comparisons, import, the printable report, extra builds, custom parts, and the Nordic and Amber themes follows Play's answer inside the app. On the web, Preview Pro still opens those.

## What the plugin sends

`getState`, `restore`, `purchase`, and the `billingUpdate` event share one shape:

```json
{
  "status": "connecting",
  "prices": {"pro_unlock": "$2.99", "tip_small": "$0.99", "tip_medium": "$2.99", "tip_large": "$4.99"},
  "pro": false,
  "proPending": false,
  "pendingTips": ["tip_small"],
  "source": "cache",
  "message": ""
}
```

`pendingTips` is an array of product ids. A tip in that list is still pending, or purchased but not consumed yet. Its button stays disabled and reads "Tip pending". When Play confirms it and `consumeAsync` succeeds, drop the id. The button comes back, and the app says thanks. A tip is not a restorable entitlement.

`purchase` also returns `outcome`: `purchased`, `pending`, `cancelled`, `owned`, or `error`, plus `reason` when something went wrong, and the state fields above.

Grant Pro only for a `PURCHASED` `pro_unlock`, then acknowledge it. Never grant Pro for a tip. Never consume Pro. Consume a verified tip so it can be bought again. Don't consume a pending or bad signature. Retry unconsumed tips on startup, on resume, and on Restore.

## Web files the Android project needs

`native-bridge.mjs` is unchanged aside from a note: the bridge still calls `getState`, `purchase({productId})`, `restore`, and `billingUpdate`. `pendingTips` rides on those payloads. No new plugin method.

`sync-web.js` copies the current site, including the planner, settings, and themes, into `www/`, bundles `native-bridge.mjs`, and adds `billing-ui.js` only in that copy. Run it after pulling this web tree, then rebuild the app.

Put the Play licensing public key in `keys/play.properties` as `playLicenseKey=...` before testing tips. Without it, tip prices should be omitted and tip buttons stay disabled. Pro can keep its existing signature check. There is still no server.

## Play Console

Create and activate `pro_unlock`, `tip_small`, `tip_medium`, and `tip_large` as one-time products. The tips are consumable because the app calls `consumeAsync`, not because Play stores a permanent entitlement. Deactivate `supporter_badge` if it was created. Test each tip twice on the license-test track, including a slow test card, and check that a tip never changes Pro.
