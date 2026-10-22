---
'silk': minor
---

Run one language server per workspace folder, on the toolchain the folder's `silk-version` pin selects. A pinned toolchain that is not installed is offered for installation (or the installed compiler can be used instead), a `silk.toml` change that selects another toolchain restarts the folder's server, and **Silk: Restart Language Server** restarts them all.
