# Homelab Power

## What's new in 1.4.0

A lab from Homelab Notebook still opens if the link is the older kind, and the newer kind opens too. Send to Notebook keeps using the older link until that changes. If machines you already sent have changed, the calculator asks whether to update Notebook. A battery on the calculator shows a rough runtime. A machine that idles high for its kind, or one that's barely on, gets a short note. An encrypted Notebook file stays in Notebook.

## What's new in 1.3.9

You can send the calculator lab or a planner build to Homelab Notebook. A lab that comes back the other way can be looked at, or saved as your lab, without Pro. Merging it into a lab you already have is part of Pro.

## What's new in 1.3.8

A build saved under the old 8U minilab name picks up the current name the next time the planner opens. A name you typed yourself stays as it is.

## What's new in 1.3.7

The long pages are split into short tabs. The calculator is Devices and Costs, with ways to save at the bottom of Costs. The planner is the rack, the parts, and the bill. The home page has a short banner that says what the app is for.

## What's new in 1.3.5

The everyday look is blue and white now. Sky Blue is the theme you get unless you pick another one. The mark in the header is two rack posts with a bolt between them, and the same blue shows up on buttons and on the word POWER. Cyber-Grid, Nordic Server, and Amber Terminal are still there if you liked them.

A calculator for what a homelab costs to leave running. Add the gear, type a rate or start from a published average, and you get energy and cost for a day, a month, and a year. Ways to save, at the bottom of Costs, covers downtime, stuffing several machines onto one host, and how long an upgrade takes to pay for itself.

The parts list and starter builds live in `data/parts.json` and `data/presets.json`. Where those numbers came from, including the November 2026 accuracy pass, is in [data/SOURCES.md](data/SOURCES.md).

It all happens in the browser. No account, no tracking, and no server. Labs are saved in `localStorage` on this device. A service worker keeps a copy of the pages so the app still opens offline, and you can put it on a phone's home screen. There's also a circuit check: load watts become amps, with a warning past 80% of the breaker. That check doesn't change the bill.

Privacy policy: https://heemsec.github.io/homelab-power/privacy.html

The Android app can sell a one-time Pro unlock and three optional tips. That wiring is described in [BILLING.md](BILLING.md). The web build does not offer either. Pro also covers a backup file you can download or bring back. The lab on the device, and share links, stay free.

GitHub Pages serves the site from the repository root:

https://heemsec.github.io/homelab-power/
