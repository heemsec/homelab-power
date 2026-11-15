# Homelab Power ↔ Homelab Notebook interchange

This is the Notebook-side spec for moving a lab between
[Homelab Notebook](https://heemsec.github.io/homelab-notebook/) and
[Homelab Power](https://heemsec.github.io/homelab-power/). Notebook implements
its half in this repo. Power should follow the same format on its side. This
document does not change Power's code.

Shared test vectors live in [`interop/test-vectors.json`](interop/test-vectors.json).

## Status

| Direction | Today | Notes |
|---|---|---|
| Notebook → Power ("Price it in Homelab Power") | Works now | Notebook encodes Power's current calculator share (`#s=`) so today's Power can open it without a Power update. |
| Power → Notebook (paste a Power share) | Works now | Notebook already imports Power `#s=` (calculator) and `#b=` (planner) links. |
| Both ways, shared `#p=` | Specified here | Versioned interchange. Notebook can emit and read `#p=`. Power should add "Send to Notebook" (emit `#p=`) and should accept `#p=` when it wants to import a Notebook lab. |

## URLs

- Notebook: `https://heemsec.github.io/homelab-notebook/#<kind>=<token>`
- Power: `https://heemsec.github.io/homelab-power/#<kind>=<token>`

`<kind>` is one letter. The token is the rest of the fragment, with no extra
query string.

| Kind | App | Token |
|---|---|---|
| `#s=` | Power calculator, current | Raw base64url of `JSON.stringify(state)`. No `j.` / `z.` prefix. `state.version` must be `1`. At most 100 devices. |
| `#b=` | Power planner, current | `j.` or gzip `z.` + base64url of the compact planner payload (`v`, `n`, `w`, `h`, `i`). |
| `#n=` | Notebook share (this app) | `j.` or gzip `z.` + base64url of a compact notebook lab. |
| `#p=` | Shared interchange (new) | `j.` or gzip `z.` + base64url of the payload below. |

Size limit for any fragment, after `#`: **100,000 characters**. At most **100
devices** in `#s=` / `#p=` and **200 hosts** in a `#n=` lab. Names are 1–100
characters for devices and 1–60 for a lab name.

Base64url is standard base64 with `+` → `-`, `/` → `_`, and trailing `=`
stripped. `j.` means raw UTF-8 JSON bytes. `z.` means those bytes gzipped.

## `#p=` payload (version 1)

```json
{
  "v": 1,
  "source": "homelab-notebook",
  "name": "Small home lab",
  "voltageMode": "120",
  "voltage": 120,
  "breaker": 15,
  "devices": [
    {
      "id": "optional-stable-id",
      "name": "pve1",
      "type": "proxmox-node",
      "partId": "beelink-eq12-n100",
      "idleW": 8,
      "typicalW": 35,
      "qty": 1,
      "ip": "192.168.1.10",
      "mac": "bc:24:11:00:00:0a"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `v` | yes | Must be `1`. Reject anything else. |
| `source` | yes | `"homelab-notebook"` or `"homelab-power"`. |
| `name` | no | Lab / build title, max 60 characters. |
| `voltageMode` | no | `"120"`, `"230"`, or `"custom"`. |
| `voltage` | no | Mains volts, 50–480. |
| `breaker` | no | Breaker amps, 1–200. |
| `devices` | yes | Array, 0–100 items. |
| `devices[].id` | no | Stable id used to re-sync a previously linked host or device. Keep it when you can. |
| `devices[].name` | yes, ideally | Display name, max 100 characters. |
| `devices[].type` | no | Notebook types: `router`, `switch`, `firewall`, `proxmox-node`, `vm`, `lxc`, `pi`, `nas`, `other`. Power may omit this and let Notebook infer from `partId`. |
| `devices[].partId` | no | An id from Power's `parts.json`. Notebook ships a slim catalog as `data/power-parts.json`. |
| `devices[].idleW` | no | Idle watts, 0–100000. |
| `devices[].typicalW` | no | Load / typical watts, 0–100000. |
| `devices[].qty` | no | Integer 1–99. Default 1. Notebook expands qty into separate hosts. |
| `devices[].ip`, `devices[].mac` | no | Optional inventory fields. Power may ignore them. |

Unknown fields must be ignored, not rejected, so a future `v: 1` addition stays
readable.

## Field mapping

### Notebook host → Power calculator device (`#s=` today, and `#p=` devices)

| Notebook | Power `#s=` device | `#p=` device |
|---|---|---|
| `id` | `id` (sanitized to `[A-Za-z0-9_-]{1,80}`) | `id` |
| `name` | `name` | `name` |
| `type` | (not in `#s=`; Power may guess) | `type` |
| `powerPartId` | (not in `#s=`) | `partId` |
| `idleWatts` | `idle` | `idleW` |
| `loadWatts` | `load` | `typicalW` |
| `loadPct` | `loadPct` (default 20) | — |
| `hours` | `hours` (default 24) | — |
| — | `start: 0`, `selected: true` | `qty: 1` |
| `ip`, `mac` | — | `ip`, `mac` |
| lab `voltage` / `breaker` / `voltageMode` | same fields on calculator state | same fields on the payload |

VMs and LXC guests are **not** sent as wall-power devices and are **not**
counted in Notebook's lab watts total, unless they have no parent. They have
no wall draw of their own.

### Power calculator `#s=` → Notebook host

| Power device | Notebook host |
|---|---|
| `id` | stored as `powerId` (used later to re-sync) |
| `name` | `name`; type is guessed from the name when possible |
| `idle`, `load`, `loadPct`, `hours` | `idleWatts`, `loadWatts`, `loadPct`, `hours` |

### Power planner `#b=` → Notebook host

| Planner item | Notebook host |
|---|---|
| `partId` | `powerPartId` and a `powerId`; type from the part's category |
| `qty` | one host per unit, names numbered when qty > 1 |
| `idleOverride` / `typicalOverride`, or the part's `idleW` / `typicalW` | `idleWatts` / `loadWatts` |

Category map used by Notebook: `sbc` → `pi`, `nas` → `nas`, `switch` → `switch`,
`router-firewall` → `router`, `mini-pc` / `used-server` / `rack-server` →
`proxmox-node`, otherwise `other`.

## What "Price it in Homelab Power" does today

Notebook builds a Power calculator `normalize()`-compatible state (`version: 1`,
USD, $0.20/kWh, the lab's voltage and breaker, and one selected device per
wall-power host) and opens:

```
https://heemsec.github.io/homelab-power/#s=<base64url-json>
```

In the Android app this opens in the system browser. A unit test encodes a
sample lab and runs the result through Power's own `decode` / `normalize`
without changing Power.

Notebook may also offer a `#p=` link for a future Power build that understands
it. Until Power accepts `#p=`, `#s=` is the send path that works on the live
site.

## What Power should change

Do this in the Homelab Power repo. Do not treat this list as already shipped.

1. **Send to Notebook (free).** Add a "Send to Notebook" (or "Import into
   Notebook") action that encodes the current calculator lab or planner build
   as `#p=` and opens:

   ```
   https://heemsec.github.io/homelab-notebook/#p=<token>
   ```

   Use the system browser in the Android app, the same way Notebook opens
   Power. Keep emitting `#s=` / `#b=` for Power-to-Power shares.

2. **Accept `#p=` (and keep `#s=` / `#b=`).** When Power is opened with `#p=`,
   show the devices read-only, or load them as a new lab if the user still has
   a free first-lab slot. Mapping is the table above, in reverse: `idleW` /
   `typicalW` → `idle` / `load`, `partId` when present, `qty` expanded, circuit
   fields applied when present.

3. **Gate only Power's own import / sync, and only as Pro.**

   - Sending to Notebook is **free**.
   - Opening a received `#p=` (or a Notebook `#s=`-style handoff) as a
     **read-only view**, or loading it as a **new lab on the first lab slot**,
     is **free**.
   - **Merging into an existing lab** and **re-syncing** previously linked
     devices (match on `devices[].id` / Notebook `powerId`, else name + type)
     is **Pro** in Power.
   - Power must not require Notebook Pro, and Notebook must not require Power
     Pro. Each app checks only its own entitlement.

4. **Do not Pro-gate watts math.** Idle/typical watts, totals, and the 80%
   breaker check stay free in both apps.

5. **Keep backward compatibility.** Existing `#s=` and `#b=` links must keep
   working. Notebook will keep importing them.

6. **Optional later:** accept a native `#p=` "Price it" from Notebook in
   addition to `#s=`, so type, part id, and inventory fields survive the trip.
   Today's `#s=` path must remain until that ships.

## Entitlement (final rule)

One-way **SEND** from either app to the other is **free**:

- Notebook "Price it in Homelab Power" is free.
- Power "Send to Notebook" should be free.

**Importing or merging into an existing lab** and **re-sync** (updating
hosts or devices that were previously linked) is **Pro** in the app that
performs the import. Opening a received link should show it read-only, or
load it as a new lab (free on the first lab). Merging into a lab the user
already has is Pro.

Pro in one app must **not** require Pro in the other. A free Notebook user
can send a lab to a Pro Power user, and a free Power user can send a build
to a Pro Notebook user. Each app gates only its own import and re-sync.

### Possible future cross-app bundle

A later option, not required now: a single Play purchase (or a pair of
linked products) that unlocks Pro in both apps. If that is added, document
the product ids here and keep single-app Pro working on its own. Until then,
there is no bundle, and neither app should look at the other's purchases.

## Re-sync

When a `#p=` device includes `id`, the receiving app should store it
(Notebook uses `host.powerId`). A later import into the same lab updates the
matched host's watts, part id, and empty inventory fields, and adds hosts
that have no match. Matching order: `id` / `powerId` first, then
`name` + `type` (case-insensitive name). Re-sync is Pro.

## Circuit check (free, both apps)

Peak wall-power load is compared to `voltage × breaker × 0.8`. Default circuit
is 120 V / 15 A (or 230 V / 16 A). Guests (VM / LXC with a parent) are left
out of the total.
