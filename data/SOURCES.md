# Where the watts come from

The catalog is `parts.json` (236 parts) and the starter builds are `presets.json`. A second pass in November 2026 reopened the cited sources, looked for another reading when one existed, and kept the better-supported wall measurement. 152 parts were left as they were, 77 had a number changed, 6 gained a clearer or a weaker confidence label, 24 got a better source link, and 6 parts were added. Two models were left out on purpose because the only numbers available were aggregator guesses: the Beelink Mini S13 and the OptiPlex 5070 Micro.

Nothing in that pass was invented. If a figure still couldn't be pinned down, it stays an estimate, and the part's notes say why.

A few rules the file follows:

- Idle is never higher than typical, and typical is never higher than max.
- Racks, patch panels, shelves, and passive strips are 0 W.
- A NAS whose typical watts already include its drives says so. Don't add those drives again.
- A PoE switch's max is the switch itself, not the budget it can hand out. Cameras and access points are their own parts. Counting both the PoE budget and the device would bill the same watt twice.
- UPS idle watts are the unit's own draw with nothing plugged in, from an ENERGY STAR no-load test or a wall meter. Runtime estimates, when the planner shows them, use a separate manufacturer runtime sheet or a published battery size. Those runtime fields were not part of the watt re-check.

Nick's 8U minilab adds up to 18.1 W idle and 22.05 W typical, which the page shows as 22.1 W. The switch in that build is 2 W, the USB fan is 0.6 W idle and 0.8 W typical, and the power hub is 0.5 W.
