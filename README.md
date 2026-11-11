# Homelab Power

A calculator for what a homelab costs to leave running. Add the gear, type a rate or start from a published average, and you get energy and cost for a day, a month, and a year. What-if cards cover downtime, stuffing several machines onto one host, and how long an upgrade takes to pay for itself.

The parts list and starter builds live in `data/parts.json` and `data/presets.json`. Where those numbers came from, including the November 2026 accuracy pass, is in [data/SOURCES.md](data/SOURCES.md).

It all happens in the browser. No account, no tracking, and no server. Labs are saved in `localStorage` on this device. A service worker keeps a copy of the pages so the app still opens offline, and you can put it on a phone's home screen. There's also a circuit check: load watts become amps, with a warning past 80% of the breaker. That check doesn't change the bill.

Privacy policy: https://heemsec.github.io/homelab-power/privacy.html

The Android app can sell a one-time Pro unlock and three optional tips. That wiring is described in [BILLING.md](BILLING.md). The web build does not offer either.

GitHub Pages serves the site from the repository root:

https://heemsec.github.io/homelab-power/
