import type {PlatformError} from '@effect/platform/Error'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Path from '@effect/platform/Path'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export type Framework =
  | 'express'
  | 'fastify'
  | 'nest'
  | 'koa'
  | 'hapi'
  | 'next'
  | 'nuxt'
  | 'remix'
  | 'astro'
  | 'effect'

export interface RepoInfo {
  readonly name: Option.Option<string>
  readonly version: Option.Option<string>
  readonly description: Option.Option<string>
  readonly packageManager: Option.Option<PackageManager>
  readonly hasTypeScript: boolean
  readonly frameworks: ReadonlyArray<Framework>
  readonly scripts: Record<string, string>
  readonly dependencies: ReadonlyArray<string>
  readonly devDependencies: ReadonlyArray<string>
}

export interface StatsService {
  readonly detectRepo: (directory: string) => Effect.Effect<RepoInfo, PlatformError>
}

export class Stats extends Context.Tag('Stats')<Stats, StatsService>() {}

const LOCKFILE_TO_MANAGER: Record<string, PackageManager> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
}

const FRAMEWORK_PACKAGES: Record<string, Framework> = {
  express: 'express',
  fastify: 'fastify',
  '@nestjs/core': 'nest',
  koa: 'koa',
  '@hapi/hapi': 'hapi',
  next: 'next',
  nuxt: 'nuxt',
  '@remix-run/node': 'remix',
  astro: 'astro',
  effect: 'effect',
}

export const StatsLive: Layer.Layer<Stats, never, FileSystem.FileSystem | Path.Path> = Layer.effect(
  Stats,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const detectRepo = (directory: string): Effect.Effect<RepoInfo, PlatformError> =>
      Effect.gen(function* () {
        const rootDir = path.resolve(directory)

        const packageManager = yield* detectPackageManager(fs, rootDir)
        const packageJson = yield* readPackageJson(fs, path, rootDir)
        const hasTypeScript = yield* detectTypeScript(fs, rootDir, packageJson)

        const allDeps = [
          ...Object.keys(packageJson.dependencies ?? {}),
          ...Object.keys(packageJson.devDependencies ?? {}),
        ]
        const frameworks = detectFrameworks(allDeps)

        return {
          name: Option.fromNullable(packageJson.name),
          version: Option.fromNullable(packageJson.version),
          description: Option.fromNullable(packageJson.description),
          packageManager,
          hasTypeScript,
          frameworks,
          scripts: packageJson.scripts ?? {},
          dependencies: Object.keys(packageJson.dependencies ?? {}),
          devDependencies: Object.keys(packageJson.devDependencies ?? {}),
        }
      })

    return {detectRepo}
  })
)

const detectPackageManager = (
  fs: FileSystem.FileSystem,
  rootDir: string
): Effect.Effect<Option.Option<PackageManager>, PlatformError> =>
  Effect.gen(function* () {
    for (const [lockfile, manager] of Object.entries(LOCKFILE_TO_MANAGER)) {
      const exists = yield* fs.exists(`${rootDir}/${lockfile}`)
      if (exists) {
        return Option.some(manager)
      }
    }
    return Option.none()
  })

interface PackageJsonShape {
  name?: string
  version?: string
  description?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const readPackageJson = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  rootDir: string
): Effect.Effect<PackageJsonShape, PlatformError> =>
  Effect.gen(function* () {
    const packageJsonPath = path.join(rootDir, 'package.json')
    const exists = yield* fs.exists(packageJsonPath)

    if (!exists) {
      return {}
    }

    const content = yield* fs.readFileString(packageJsonPath)
    try {
      return JSON.parse(content) as PackageJsonShape
    } catch {
      return {}
    }
  })

const detectTypeScript = (
  fs: FileSystem.FileSystem,
  rootDir: string,
  packageJson: PackageJsonShape
): Effect.Effect<boolean, PlatformError> =>
  Effect.gen(function* () {
    const hasTsConfig = yield* fs.exists(`${rootDir}/tsconfig.json`)
    if (hasTsConfig) return true

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }
    if ('typescript' in allDeps) return true

    return false
  })

const detectFrameworks = (dependencies: Array<string>): Array<Framework> => {
  const frameworks: Array<Framework> = []

  for (const dep of dependencies) {
    const framework = FRAMEWORK_PACKAGES[dep]
    if (framework && !frameworks.includes(framework)) {
      frameworks.push(framework)
    }
  }

  return frameworks
}

export const formatRepoInfo = (info: RepoInfo): string => {
  const lines: Array<string> = []

  const name = Option.getOrElse(info.name, () => 'Unknown')
  const version = Option.map(info.version, v => `v${v}`)
  lines.push(`${name}${Option.isSome(version) ? ` (${version.value})` : ''}`)

  if (Option.isSome(info.description)) {
    lines.push(info.description.value)
  }

  lines.push('')

  if (Option.isSome(info.packageManager)) {
    lines.push(`Package Manager: ${info.packageManager.value}`)
  }

  lines.push(`TypeScript: ${info.hasTypeScript ? 'Yes' : 'No'}`)

  if (info.frameworks.length > 0) {
    lines.push(`Frameworks: ${info.frameworks.join(', ')}`)
  }

  const scriptCount = Object.keys(info.scripts).length
  if (scriptCount > 0) {
    lines.push(`Scripts: ${scriptCount} defined`)
  }

  lines.push(`Dependencies: ${info.dependencies.length} prod, ${info.devDependencies.length} dev`)

  return lines.join('\n')
}
