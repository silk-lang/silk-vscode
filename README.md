# Silk for Visual Studio Code

Language support for [Silk](https://github.com/silk-lang/silk) `.silk` files.

Today the extension provides syntax highlighting, bracket matching, comment toggling, and
documentation-comment continuation. Language server features (diagnostics, hover, go to
definition, formatting) will come from the native Silk compiler.

## Develop

```sh
pnpm install
pnpm test       # grammar assertions in test/grammar
pnpm package    # builds silk-<version>.vsix
```

Open this folder in VS Code and press <kbd>F5</kbd> to launch an Extension Development Host with
the extension loaded. To install a build locally:

```sh
code --install-extension silk-0.0.1.vsix
```

## Layout

| Path                            | Contents                                      |
| ------------------------------- | --------------------------------------------- |
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

## License

MIT
