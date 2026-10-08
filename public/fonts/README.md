# Fonts (binaries not committed)

This folder's binaries are **gitignored**: they are licensed for use in
this project but not for redistribution in a public repository. The CSS
(`src/styles/tokens/fonts.css`) references them at `/fonts/...` — after a
fresh clone the site falls back to the system fonts listed in the stacks
(`src/styles/tokens/typography.css`) until you drop the files back in.

## Required files

| File | License | Where to get it |
| --- | --- | --- |
| `Svetze.otf` | Personal use only (commercial licence = pre-launch blocker) | From the designer you licensed it from |
| `Aptos.ttf`, `Aptos-Light`, `Aptos-Italic`, `Aptos-SemiBold`, `Aptos-Bold`, `Aptos-ExtraBold` | Microsoft (ships with Microsoft 365 / Office; not redistributable) | Copy from `C:\Windows\Fonts\` on a machine with Office installed |
| `Aptos-Display.ttf`, `Aptos-Display-Bold.ttf` | Microsoft (same) | Same |
| `Aptos-Mono.ttf`, `Aptos-Mono-Bold.ttf` | Microsoft (same) | Same |

Place the files directly in this folder with exactly those names, then
restart the dev server.

## Open-source swaps (optional)

To make the repo fully self-contained, replace both families with
open-licensed fonts, e.g. from Google Fonts:

- Display (`Svetze`) → **Fraunces**, **Playfair Display**, or **Sora**
- Sans (`Aptos`) → **Inter**
- Mono (`Aptos Mono`) → **IBM Plex Mono** or **JetBrains Mono**

Only commit font files whose licence allows redistribution (SIL OFL fonts
do; keep their `OFL.txt` next to the binaries).
