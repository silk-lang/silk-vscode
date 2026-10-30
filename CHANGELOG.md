# silk

## 0.2.0

### Minor Changes

- 3e2f9a1: Ask the silk tool which Silk version a folder pins and install it with `silk use`, now that the compiler (`silkc`) has no `silk toolchain` command. A missing pinned version can run on your default version instead. `silk.path` may name the tool or a compiler; a compiler runs the language server as is.

### Patch Changes

- 39d9918: Highlight directives such as `@inlineAlways` and `@foreign(...)`, which replace `with` clauses, and the `#Role` marker on reference types.

## 0.1.1

### Patch Changes

- 088ee07: Each Silk file now has one language server. Opening a file outside the workspace folders, such as a standard library file reached by go to definition, no longer starts a second server that also attaches to every other file, which made each hover appear twice. A folder's server also serves the standard library its toolchain reads, so language features keep working after go to definition into the library. Other files outside every folder share one server that serves only them.

## 0.1.0

### Minor Changes

- 797b9ff: Start the Silk language server (`silk lsp`) for `.silk` files: syntax errors as you type, the document outline, folding, and Format Document. Set `silk.path` to choose the compiler; it defaults to `silk` on `PATH`.
- aab1f57: Run one language server per workspace folder, on the toolchain the folder's `silk-version` pin selects. A pinned toolchain that is not installed is offered for installation (or the installed compiler can be used instead), a `silk.toml` change that selects another toolchain restarts the folder's server, and **Silk: Restart Language Server** restarts them all.
