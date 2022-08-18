/* eslint-disable camelcase */
/* eslint-disable standard/no-callback-literal */
const fs = require('fs')
const util = require('util')
const readdir = util.promisify(fs.readdir)
const rm = util.promisify(fs.rm)
const reifyFinish = require('./utils/reify-finish.js')
const log = require('npmlog')
const { resolve, join } = require('path')
const Arborist = require('@npmcli/arborist')
const runScript = require('@npmcli/run-script')

const ArboristWorkspaceCmd = require('./workspaces/arborist-cmd.js')
const { openStdin } = require('process')
class Install extends ArboristWorkspaceCmd {
  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get description () {
    return 'Install a package'
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get name () {
    return 'install'
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get params () {
    return [
      'save',
      'save-exact',
      'global',
      'global-style',
      'legacy-bundling',
      'strict-peer-deps',
      'package-lock',
      'omit',
      'ignore-scripts',
      'audit',
      'bin-links',
      'fund',
      'dry-run',
      'rosette',
      'minnpm',
      'rosette-only-explore',
      'consistency',
      'disallow-cycles',
      'minimize',
      're-solve-with-npm',
      'solve-fresh',
      ...super.params,
    ]
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get usage () {
    return [
      '[<@scope>/]<pkg>',
      '[<@scope>/]<pkg>@<tag>',
      '[<@scope>/]<pkg>@<version>',
      '[<@scope>/]<pkg>@<version range>',
      '<alias>@npm:<name>',
      '<folder>',
      '<tarball file>',
      '<tarball url>',
      '<git:// url>',
      '<github username>/<github project>',
    ]
  }

  async completion (opts) {
    const { partialWord } = opts
    // install can complete to a folder with a package.json, or any package.
    // if it has a slash, then it's gotta be a folder
    // if it starts with https?://, then just give up, because it's a url
    if (/^https?:\/\//.test(partialWord)) {
      // do not complete to URLs
      return []
    }

    if (/\//.test(partialWord)) {
      // Complete fully to folder if there is exactly one match and it
      // is a folder containing a package.json file.  If that is not the
      // case we return 0 matches, which will trigger the default bash
      // complete.
      const lastSlashIdx = partialWord.lastIndexOf('/')
      const partialName = partialWord.slice(lastSlashIdx + 1)
      const partialPath = partialWord.slice(0, lastSlashIdx) || '/'

      const annotatePackageDirMatch = async (sibling) => {
        const fullPath = join(partialPath, sibling)
        if (sibling.slice(0, partialName.length) !== partialName)
          return null // not name match

        try {
          const contents = await readdir(fullPath)
          return {
            fullPath,
            isPackage: contents.indexOf('package.json') !== -1,
          }
        } catch (er) {
          return { isPackage: false }
        }
      }

      try {
        const siblings = await readdir(partialPath)
        const matches = await Promise.all(
          siblings.map(async sibling => {
            return await annotatePackageDirMatch(sibling)
          })
        )
        const match = matches.filter(el => !el || el.isPackage).pop()
        if (match) {
          // Success - only one match and it is a package dir
          return [match.fullPath]
        } else {
          // no matches
          return []
        }
      } catch (er) {
        return [] // invalid dir: no matching
      }
    }
    // Note: there used to be registry completion here,
    // but it stopped making sense somewhere around
    // 50,000 packages on the registry
  }

  exec (args, cb) {
    this.install(args).then(() => cb()).catch(cb)
  }

  async install (args) {
    // the /path/to/node_modules/..
    const globalTop = resolve(this.npm.globalDir, '..')
    const ignoreScripts = this.npm.config.get('ignore-scripts')
    const isGlobalInstall = this.npm.config.get('global')
    const where = isGlobalInstall ? globalTop : this.npm.prefix

    // don't try to install the prefix into itself
    args = args.filter(a => resolve(a) !== this.npm.prefix)

    // `npm i -g` => "install this package globally"
    if (where === globalTop && !args.length)
      args = ['.']

    // TODO: Add warnings for other deprecated flags?  or remove this one?
    if (this.npm.config.get('dev'))
      log.warn('install', 'Usage of the `--dev` option is deprecated. Use `--include=dev` instead.')

    const opts = {
      ...this.npm.flatOptions,
      log: this.npm.log,
      auditLevel: null,
      path: where,
      add: args,
      workspaces: this.workspaceNames,
    }
    if(opts.minnpm) {
      opts.rosette = true;
    }
    
    let finalArb = null
    if(opts.rosette) {
      const rosetteOpts = {
        ...opts,
        rosetteSolverPath: resolve(opts.npmBin, '../../../RosetteSolver/rosette-solver'),
        rosetteConsistencyArg: this.npm.flatOptions.consistency,
        rosetteDisallowCyclesArg: this.npm.flatOptions.disallowCycles,
        rosetteMinimizeArg: this.npm.flatOptions.minimize
      }
      const noRosetteOpts = {...opts, rosette: false}

      if(this.npm.flatOptions.solveFresh) {
        const node_modules_dir = resolve(where, 'node_modules')
        const lock_path = resolve(where, 'package-lock.json')
        const lock_path_yarn = resolve(where, 'yarn.lock')

        try {
          await rm(node_modules_dir, {recursive: true})
          await rm(lock_path)
          await rm(lock_path_yarn)
        } catch {

        }
      }
      
      const arb = new Arborist(rosetteOpts)
      await arb.buildIdealTree(rosetteOpts)
      await arb.reify(rosetteOpts)
      finalArb = arb

      if(this.npm.flatOptions.reSolveWithNpm) {
        const arb2 = new Arborist(noRosetteOpts)
        await arb2.reify(noRosetteOpts)
        finalArb = arb2
      }
    } else {
      const arb = new Arborist(opts)
      await arb.reify(opts)
      finalArb = arb
    }

    
    if (!args.length && !isGlobalInstall && !ignoreScripts) {
      const scriptShell = this.npm.config.get('script-shell') || undefined
      const scripts = [
        'preinstall',
        'install',
        'postinstall',
        'prepublish', // XXX should we remove this finally??
        'preprepare',
        'prepare',
        'postprepare',
      ]
      for (const event of scripts) {
        await runScript({
          path: where,
          args: [],
          scriptShell,
          stdio: 'inherit',
          stdioString: true,
          banner: log.level !== 'silent',
          event,
        })
      }
    }
    await reifyFinish(this.npm, finalArb)
  }
}
module.exports = Install
