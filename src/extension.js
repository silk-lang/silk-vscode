// Runs the native compiler's language server, `silk lsp`, over standard input and output for
// Silk documents. Each workspace folder gets its own server, started in that folder, so the silk
// tool runs the compiler of the Silk version the folder's `silk-version` pin selects. Before
// starting, `silk use which --json` says whether that version is installed, and a missing one is
// offered for installation (`silk use`) instead of failing. A `silk.path` that names a compiler
// (`silkc`) rather than the tool runs `silk lsp` as is. Servers restart when `silk.path` changes
// or a `silk.toml` change selects another version.
//
// Every Silk file has exactly one server, or VS Code would show each hover and definition once
// per server. A folder's server also serves the standard library its toolchain reads, so go to
// definition into the library keeps working there. Files outside every folder and library go to
// one more server, which lists them by path.
const vscode = require('vscode')
const { execFile } = require('node:child_process')
const { existsSync, realpathSync } = require('node:fs')
const path = require('node:path')
const { LanguageClient } = require('vscode-languageclient/node')

// The `silk use which` exit status for a selected version that is not installed.
const NOT_INSTALLED = 3

// Servers by workspace folder URI, each `{ selected, client, library }`, where `library` is the
// standard library directory the server also serves; the empty key serves the files in `outside`.
// An entry without a client is a server that is starting or was declined.
const servers = new Map()

// The standard library directory each folder's server last reported, kept across restarts.
const libraries = new Map()

// The paths of the open Silk files outside every folder and served library.
const outside = []

const command = () => vscode.workspace.getConfiguration('silk').get('path', 'silk')

// Runs the silk tool with `args` in `cwd`; one that cannot start reports status -1.
const run = (args, cwd) =>
  new Promise((resolve) => {
    execFile(command(), args, { cwd, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      const status = error ? (typeof error.code === 'number' ? error.code : -1) : 0
      resolve({ status, stdout: String(stdout), stderr: String(stderr) })
    })
  })

// The version the silk tool selects in `cwd`, or undefined when `silk.path` names a compiler,
// which runs the server itself.
const which = async (cwd) => {
  const result = await run(['use', 'which', '--json'], cwd)
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
      const result = await run(['use', '--json'], cwd)
      if (result.status === 0) {
        return true
      }
      const reason = result.stderr.trim().split('\n').pop() || `exit status ${result.status}`
      void vscode.window.showErrorMessage(`Cannot install Silk ${selected.version}: ${reason}`)
      return false
    },
  )

// A glob pattern for the path `file`, with glob syntax escaped so it matches literally.
const literal = (file) => file.replace(/\\/g, '/').replace(/[*?{}[\]]/g, (special) => `[${special}]`)

const under = (directory, file) => {
  const relative = path.relative(directory, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

// The standard library beside a version's compiler, as `silk lsp` finds it, when it exists.
const libraryBeside = (selected) => {
  if (!selected?.path) {
    return undefined
  }
  try {
    const library = path.join(path.dirname(path.dirname(realpathSync(selected.path))), 'lib', 'silk', 'stdlib')
    return existsSync(library) ? library : undefined
  } catch {
    return undefined
  }
}

// The key of the server that serves `file`, when one does.
const serving = (file) => {
  for (const [key, entry] of servers) {
    if (key && entry.library && under(entry.library, file)) {
      return key
    }
  }
  return outside.includes(file) ? '' : undefined
}

// Whether another folder's server already serves `library`.
const claimed = (key, library) =>
  [...servers].some(([other, entry]) => other !== key && entry.library === library)

const selectorFor = (key, folder, library) => {
  const filter = (pattern) => ({ scheme: 'file', language: 'silk', pattern })
  if (!key) {
    return outside.map((file) => filter(literal(file)))
  }
  const selector = [filter(`${literal(folder.uri.fsPath)}/**/*`)]
  if (library) {
    selector.push(filter(`${literal(library)}/**/*`))
  }
  return selector
}

// Your default Silk version (`silk use <version>`), when one is installed.
const installedDefault = async (cwd) => {
  const result = await run(['use', 'list', '--json'], cwd)
  try {
    return JSON.parse(result.stdout).toolchains?.find((toolchain) => toolchain.default)?.version
  } catch {
    return undefined
  }
}

// Starts the server for `folder` into `entry`, first installing its version when the user
// agrees. "Use <default>" runs the server with SILK_TOOLCHAIN set to your default version
// instead. A restart or stop while this waits replaces `entry`, and this start then gives up.
const start = async (key, folder, entry) => {
  const cwd = folder?.uri.fsPath
  const selected = await which(cwd)
  let env
  if (selected && !selected.installed) {
    const fallback = await installedDefault(cwd)
    const instead = fallback && `Use ${fallback}`
    const choice = await vscode.window.showWarningMessage(
      `Silk ${selected.version} is pinned in ${source(selected)} but not installed.`,
      ...(instead ? ['Install', instead] : ['Install']),
    )
    if (instead && choice === instead) {
      env = { ...process.env, SILK_TOOLCHAIN: fallback }
    } else if (choice !== 'Install' || !(await install(cwd, selected))) {
      entry.selected = selected
      return
    }
  }
  if (servers.get(key) !== entry) {
    return
  }
  // The library the server reported last time, or else the one beside its version's compiler.
  if (key) {
    const library = libraries.get(key) ?? libraryBeside(env ? undefined : selected)
    entry.library = library && !claimed(key, library) ? library : undefined
  }
  // Without a transport, the client speaks over stdio and adds no `--stdio` argument.
  const server = { command: command(), args: ['lsp'], options: { cwd, env } }
  const client = new LanguageClient(
    'silk',
    folder ? `Silk (${folder.name})` : 'Silk',
    { run: server, debug: server },
    { documentSelector: selectorFor(key, folder, entry.library), workspaceFolder: folder },
  )
  // A server forced onto the default is reselected on the next manifest change.
  entry.selected = env ? undefined : selected
  entry.client = client
  try {
    await client.start()
    if (key) {
      await adopt(key, entry, client)
    }
  } catch (error) {
    const compiler = selected ? `Silk ${selected.version}` : command()
    void vscode.window.showErrorMessage(
      `${compiler} could not start its language server (silk lsp). Compilers older than the ` +
        `language server have none; pin a newer one with "silk set <version>", then "silk use". ` +
        `${error?.message ?? ''}`.trim(),
    )
  }
}

// Records the standard library the started server reports reading. A library other than the one
// the server was started with restarts it to serve that one; files that now have a folder's
// server leave the outside server.
const adopt = async (key, entry, client) => {
  const reported = client.initializeResult?.capabilities?.experimental?.standardLibrary
  if (typeof reported !== 'string' || servers.get(key) !== entry) {
    return
  }
  const library = vscode.Uri.parse(reported).fsPath
  libraries.set(key, library)
  if (library !== entry.library && !claimed(key, library)) {
    await restart(key)
    return
  }
  const before = outside.length
  for (let at = outside.length - 1; at >= 0; at--) {
    if (serving(outside[at]) === key) {
      outside.splice(at, 1)
    }
  }
  if (outside.length !== before) {
    await (outside.length > 0 ? restart('') : stop(''))
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
  const entry = { selected: undefined, client: undefined, library: undefined }
  servers.set(key, entry)
  await start(key, folderOf(key), entry)
}

const restartAll = () => Promise.all([...servers.keys()].map(restart))

// Starts the server for a Silk document's folder unless one exists. A file outside every folder
// and served library joins the outside server's files, which restarts it to serve them.
const ensure = (document) => {
  if (document.languageId !== 'silk' || document.uri.scheme !== 'file') {
    return
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (!folder) {
    const file = document.uri.fsPath
    if (serving(file) === undefined) {
      outside.push(file)
      void restart('')
    }
    return
  }
  const key = folderKey(folder)
  if (!servers.has(key)) {
    const entry = { selected: undefined, client: undefined, library: undefined }
    servers.set(key, entry)
    void start(key, folder, entry)
  }
}

// After a `silk.toml` change, restarts each server whose folder now selects another version, or
// whose missing version has since been installed.
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
        libraries.delete(folderKey(folder))
        void stop(folderKey(folder))
      }
    }),
    vscode.commands.registerCommand('silk.restartServer', restartAll),
  )
  vscode.workspace.textDocuments.forEach(ensure)
}

exports.deactivate = () =>
  Promise.all([...servers.values()].map((entry) => entry.client?.stop().catch(() => {})))
