# silk

## 0.1.0

### Minor Changes

- 797b9ff: Start the Silk language server (`silk lsp`) for `.silk` files: syntax errors as you type, the document outline, folding, and Format Document. Set `silk.path` to choose the compiler; it defaults to `silk` on `PATH`.
- aab1f57: Run one language server per workspace folder, on the toolchain the folder's `silk-version` pin selects. A pinned toolchain that is not installed is offered for installation (or the installed compiler can be used instead), a `silk.toml` change that selects another toolchain restarts the folder's server, and **Silk: Restart Language Server** restarts them all.
