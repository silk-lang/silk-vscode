// Runs the native compiler's language server, `silk lsp`, over standard input and output for
// Silk documents, and restarts it when `silk.path` changes.
const vscode = require('vscode')
const { LanguageClient } = require('vscode-languageclient/node')

let client

const start = () => {
  const command = vscode.workspace.getConfiguration('silk').get('path', 'silk')
  // Without a transport, the client speaks over stdio and adds no `--stdio` argument.
  const server = { command, args: ['lsp'] }
  client = new LanguageClient(
    'silk',
    'Silk',
    { run: server, debug: server },
    { documentSelector: [{ scheme: 'file', language: 'silk' }] },
  )
  return client.start()
}

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration('silk.path')) {
        void client.stop().then(start)
      }
    }),
  )
  return start()
}

exports.deactivate = () => client?.stop()
