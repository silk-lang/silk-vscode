// Runs the native compiler's language server, `silk lsp`, over standard input and output for
// Silk documents. Each workspace folder gets its own server, started in that folder, so `silk`
// dispatches to the toolchain the folder's `silk-version` pin selects. Before starting,
// `silk toolchain which --json` says whether that toolchain is installed, and a missing one is
// offered for installation instead of failing. Servers restart when `silk.path` changes or a
// `silk.toml` change selects another toolchain.
const vscode = require('vscode')
const { execFile } = require('node:child_process')
const { LanguageClient } = require('vscode-languageclient/node')

// The `silk toolchain` exit status for a selected toolchain that is not installed.
const NOT_INSTALLED = 3

// Servers by workspace folder URI, each `{ selected, client }`; the empty key serves Silk files
// outside every folder. An entry without a client is a server that is starting or was declined.
const servers = new Map()

const command = () => vscode.workspace.getConfiguration('silk').get('path', 'silk')

const run = (args, cwd) =>
  new Promise((resolve) => {
    execFile(command(), args, { cwd, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      const status = error ? (typeof error.code === 'number' ? error.code : -1) : 0
      resolve({ status, stdout: String(stdout), stderr: String(stderr) })
    })
  })

// The toolchain `silk` selects in `cwd`, or undefined when the compiler predates
// `silk toolchain` and so runs the server itself.
const which = async (cwd) => {
  const result = await run(['toolchain', 'which', '--json'], cwd)
  if (result.status !== 0 && result.status !== NOT_INSTALLED) {
    return undefined
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    return undefined
  }
}

// Where a selection came from, for messages.
const source = (selected) => {
  switch (selected.origin) {
    case 'workspace':
    case 'package':
      return selected.manifest ?? 'silk.toml'
    case 'environment':
      return 'SILK_TOOLCHAIN'
    case 'default':
      return 'settings.toml'
    default:
      return 'the command line'
  }
}

const install = (cwd, selected) =>
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Installing Silk ${selected.version}` },
    async () => {
      const result = await run(['toolchain', 'install', '--json'], cwd)
      if (result.status === 0) {
        return true
      }
      const reason = result.stderr.trim().split('\n').pop() || `exit status ${result.status}`
      void vscode.window.showErrorMessage(`Cannot install Silk ${selected.version}: ${reason}`)
      return false
    },
  )

// Starts the server for `folder` into `entry`, first installing its toolchain when the user
// agrees. "Use installed version" runs the server with SILK_TOOLCHAIN=local, the configured
// compiler. A restart or stop while this waits replaces `entry`, and this start then gives up.
const start = async (key, folder, entry) => {
  const cwd = folder?.uri.fsPath
  const selected = await which(cwd)
  let env
  if (selected && !selected.installed) {
    const choice = await vscode.window.showWarningMessage(
      `Silk ${selected.version} is pinned in ${source(selected)} but not installed.`,
      'Install',
      'Use installed version',
    )
    if (choice === 'Use installed version') {
      env = { ...process.env, SILK_TOOLCHAIN: 'local' }
    } else if (choice !== 'Install' || !(await install(cwd, selected))) {
      entry.selected = selected
      return
    }
  }
  if (servers.get(key) !== entry) {
    return
  }
  // Without a transport, the client speaks over stdio and adds no `--stdio` argument.
  const server = { command: command(), args: ['lsp'], options: { cwd, env } }
  const client = new LanguageClient(
    'silk',
    folder ? `Silk (${folder.name})` : 'Silk',
    { run: server, debug: server },
    {
      documentSelector: [
        folder
          ? { scheme: 'file', language: 'silk', pattern: `${folder.uri.fsPath}/**/*` }
          : { scheme: 'file', language: 'silk' },
      ],
      workspaceFolder: folder,
    },
  )
  // A forced local server is reselected on the next manifest change.
  entry.selected = env ? undefined : selected
  entry.client = client
  try {
    await client.start()
  } catch (error) {
    const compiler = selected ? `Silk ${selected.version}` : command()
    void vscode.window.showErrorMessage(
      `${compiler} could not start its language server (silk lsp). Compilers older than the ` +
        `language server have none; pin a newer one with "silk toolchain use <version>". ` +
        `${error?.message ?? ''}`.trim(),
    )
  }
}

const folderKey = (folder) => folder?.uri.toString() ?? ''

const folderOf = (key) =>
  key ? vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(key)) : undefined

const stop = async (key) => {
  const previous = servers.get(key)
  servers.delete(key)
  // Disposes the client whatever state it is in, including after it gave up on a crashing server.
  await previous?.client?.dispose().catch(() => {})
}

const restart = async (key) => {
  await stop(key)
  const entry = { selected: undefined, client: undefined }
  servers.set(key, entry)
  await start(key, folderOf(key), entry)
}

const restartAll = () => Promise.all([...servers.keys()].map(restart))

// Starts the server for a Silk document's folder unless one exists.
const ensure = (document) => {
  if (document.languageId !== 'silk' || document.uri.scheme !== 'file') {
    return
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  const key = folderKey(folder)
  if (!servers.has(key)) {
    const entry = { selected: undefined, client: undefined }
    servers.set(key, entry)
    void start(key, folder, entry)
  }
}

// After a `silk.toml` change, restarts each server whose folder now selects another toolchain,
// or whose missing toolchain has since been installed.
const reselect = async () => {
  for (const [key, entry] of [...servers]) {
    const selected = await which(folderOf(key)?.uri.fsPath)
    const before = entry.selected
    if (
      selected?.version !== before?.version ||
      selected?.installed !== before?.installed ||
      selected?.path !== before?.path
    ) {
      await restart(key)
    }
  }
}

exports.activate = (context) => {
  const manifests = vscode.workspace.createFileSystemWatcher('**/silk.toml')
  let pending
  const changed = () => {
    clearTimeout(pending)
    pending = setTimeout(() => void reselect(), 300)
  }
  context.subscriptions.push(
    manifests,
    manifests.onDidChange(changed),
    manifests.onDidCreate(changed),
    manifests.onDidDelete(changed),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration('silk.path')) {
        void restartAll()
      }
    }),
    vscode.workspace.onDidOpenTextDocument(ensure),
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.removed) {
        void stop(folderKey(folder))
      }
    }),
    vscode.commands.registerCommand('silk.restartServer', restartAll),
  )
  vscode.workspace.textDocuments.forEach(ensure)
}

exports.deactivate = () =>
  Promise.all([...servers.values()].map((entry) => entry.client?.stop().catch(() => {})))
