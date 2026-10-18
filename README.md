# Silk for Visual Studio Code

Language support for [Silk](https://github.com/silk-lang/silk) `.silk` files.

Today the extension provides syntax highlighting, bracket matching, comment toggling, and
documentation-comment continuation. Language server features (diagnostics, hover, go to
definition, formatting) will come from the native Silk compiler.

## Develop

```sh
bun install
bun run test      # grammar assertions in test/grammar
bun run package   # builds silk-<version>.vsix
```

Open this folder in VS Code and press <kbd>F5</kbd> to launch an Extension Development Host with
the extension loaded. To install a build locally:

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
| `test/grammar/`                 | `vscode-tmgrammar-test` scope assertions      |

The extension is declarative for now. The language client will live in `src/` with a `main` entry
in `package.json` that starts the native compiler's language server; the grammar and language
configuration stay as they are.

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
