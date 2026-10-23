# Silk for Visual Studio Code

Language support for [Silk](https://github.com/silk-lang/silk) `.silk` files.

The extension provides syntax highlighting, bracket matching, comment toggling, and
documentation-comment continuation. It also starts the native compiler's language server,
`silk lsp`, which reports syntax errors as you type and provides the document outline, folding,
and Format Document. More features will come from the compiler as the server grows.

The server runs `silk` from `PATH`, which [sew](https://github.com/silk-lang/silk#install)
installs as a second name for itself. To use another compiler, such as one you built, set
`silk.path` to its full path; `silk.sewPath` names sew the same way.

Each workspace folder gets its own server, started in that folder, so it runs the Silk version the
folder's `silk.toml` pins with `silk-version`. That server also serves the standard library its
version reads, so hover and go to definition keep working after you jump into the library. Two
folders pinned to different versions run two servers with two compilers. When the pinned version
is not installed, the extension offers to install it (`sew use`) or to use your default version
instead. Editing `silk-version` restarts the folder's server on the newly selected version, and
**Silk: Restart Language Server** restarts every server. Without sew, `silk lsp` runs as is.

## Develop

```sh
bun install
bun run test      # grammar assertions in test/grammar
bun run build     # bundles src/extension.js into dist/extension.js
bun run package   # builds silk-<version>.vsix
```

Run `bun run build`, then open this folder in VS Code and press <kbd>F5</kbd> to launch an
Extension Development Host with the extension loaded. To install a build locally:

```sh
bun run package --out silk.vsix
code --install-extension silk.vsix --force
```

## Releases

Changesets manages the extension version and changelog. For a release-worthy change, run:

```sh
bun run changeset
```

Select `silk`, choose a patch/minor/major bump, and describe the user-visible change.
Commit the generated `.changeset/*.md` file with the implementation. Do not bump
`package.json` manually.

On `main`, the Release workflow runs the grammar tests and opens or updates a
**Release Silk** pull request. That PR updates `package.json`, refreshes `bun.lock`,
generates `CHANGELOG.md`, and consumes the pending changesets. Merge it to publish
the new version to the VS Code Marketplace.

With no pending changesets, the workflow builds `silk.vsix` and publishes that exact
artifact using Microsoft Entra authentication. Already-published versions are skipped;
authentication and other publishing errors still fail the job. To retry a failed
publish, rerun the workflow or manually dispatch **Release** on `main`.
Select **verify-only** when manually dispatching to print the Marketplace identity ID
and check publisher permissions without uploading a VSIX. Use this for initial
identity authorization and subsequent authentication checks.

The package is marked `private` to prevent npm publication; Changesets is configured
to version it anyway. Do not use `changeset publish`: releases go through `vsce`.

### One-time publishing setup

1. In the `silk-lang` organization's **Settings → Actions → General**, allow GitHub
   Actions to create and approve pull requests, then enable the same option in this
   repository. Organization policy must permit the repository setting.
2. Use the repository's `marketplace` GitHub environment, restricted to the `main`
   branch. Create a Microsoft Entra publishing identity and configure its GitHub
   federated credential with:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:silk-lang@316790127/silk-vscode@1422845127:environment:marketplace`
   - Audience: `api://AzureADTokenExchange`
   This repository uses GitHub's immutable OIDC subject format. In Entra's GitHub
   form, use organization ID `316790127` and repository ID `1422845127`, with entity
   type **Environment** and environment name `marketplace`.
3. Register the identity with Marketplace and grant it **Contributor** access to the
   `silk-lang` publisher, following Microsoft's
   [secure publishing setup](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).
4. Add `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` as GitHub Actions **environment
   variables** on `marketplace`. These are identity IDs, not client secrets.

The publish job uses [Azure Login with OIDC](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended)
and does not require an Azure subscription selection, a client secret, or `VSCE_PAT`.
The version-PR job has no Marketplace credentials or OIDC permission.

## Layout

| Path                            | Contents                                      |
| ------------------------------- | --------------------------------------------- |
| `icon.png`                     | Extension thumbnail for VS Code and Marketplace |
| `syntaxes/silk.tmLanguage.json` | TextMate grammar (`source.silk`)              |
| `language-configuration.json`   | Comments, brackets, auto-closing, indentation |
| `src/extension.js`              | Language client that starts `silk lsp`        |
| `test/grammar/`                 | `vscode-tmgrammar-test` scope assertions      |

The language client in `src/` is bundled with esbuild into `dist/extension.js`, the package's
`main`. It runs `sew use which --json` in each workspace folder, then launches `silk lsp`
there over standard input and output. It restarts a server when `silk.path` or `silk.sewPath`
changes or a `silk.toml` change selects another version; all language features come from the
server.

## Grammar

The grammar follows the native lexer in
[`compiler/src/lexer`](https://github.com/silk-lang/silk/tree/main/compiler/src/lexer): its keyword
set, `//` comments with `///` item docs and `//!` module docs, text (`"…"`, `"""…"""`), raw
(`r"…"`), and byte (`b"…"`) literals, character literals, lifetimes (`'a`), integer and float
literals in decimal, hex, octal, and binary, and duration literals such as `1h30m`. When the lexer
changes, update the grammar and add an assertion under `test/grammar/`.

Import paths are highlighted as module paths, even when a segment shares a name with a
keyword or primitive type (for example, `silk.effect` or `silk.bool`). Names inside import
braces retain their normal highlighting.

## License

MIT
