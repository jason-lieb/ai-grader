import type {PlatformError} from '@effect/platform/Error'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Path from '@effect/platform/Path'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export interface ProjectFile {
  readonly path: string
  readonly relativePath: string
  readonly content: string
  readonly extension: string
  readonly sizeBytes: number
}

export interface ScanOptions {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly ignorePatterns: ReadonlyArray<string>
  readonly concurrency: number
}

export const defaultScanOptions: ScanOptions = {
  maxFiles: 50,
  maxFileBytes: 50000,
  ignorePatterns: [],
  concurrency: 5,
}

export interface RepoSnapshot {
  readonly files: ReadonlyArray<ProjectFile>
  readonly totalFiles: number
  readonly skippedFiles: number
  readonly skippedReasons: Record<string, number>
}

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
])

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.direnv',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  '.output',
  '.nuxt',
  '.vercel',
  '.netlify',
  '__pycache__',
  '.venv',
  'vendor',
])

const IGNORE_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
])

export interface FileService {
  readonly scanProject: (
    directory: string,
    options?: Partial<ScanOptions>
  ) => Effect.Effect<RepoSnapshot, PlatformError>
}

export class File extends Context.Tag('File')<File, FileService>() {}

export const FileLive: Layer.Layer<File, never, FileSystem.FileSystem | Path.Path> = Layer.effect(
  File,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const scanProject = (
      directory: string,
      opts?: Partial<ScanOptions>
    ): Effect.Effect<RepoSnapshot, PlatformError> =>
      Effect.gen(function* () {
        const options = {...defaultScanOptions, ...opts}
        const rootDir = path.resolve(directory)

        const allFilePaths: Array<{
          fullPath: string
          relativePath: string
          extension: string
        }> = []
        const skippedReasons: Record<string, number> = {}

        const addSkipped = (reason: string) => {
          skippedReasons[reason] = (skippedReasons[reason] || 0) + 1
        }

        const matchesIgnorePattern = (relativePath: string): boolean => {
          for (const pattern of options.ignorePatterns) {
            if (relativePath.includes(pattern)) {
              return true
            }
          }
          return false
        }

        const collectFiles = (dir: string): Effect.Effect<void, PlatformError> =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(dir)

            for (const entry of entries) {
              const fullPath = path.join(dir, entry)
              const stat = yield* fs.stat(fullPath)

              if (stat.type === 'Directory') {
                if (!IGNORE_DIRS.has(entry)) {
                  yield* collectFiles(fullPath)
                }
              } else if (stat.type === 'File') {
                const relativePath = path.relative(rootDir, fullPath)

                if (IGNORE_FILES.has(entry)) {
                  addSkipped('ignored-file')
                  continue
                }

                if (matchesIgnorePattern(relativePath)) {
                  addSkipped('ignore-pattern')
                  continue
                }

                const ext = path.extname(entry)

                if (!CODE_EXTENSIONS.has(ext)) {
                  addSkipped('non-code-extension')
                  continue
                }

                allFilePaths.push({fullPath, relativePath, extension: ext})
              }
            }
          })

        yield* collectFiles(rootDir)

        const totalFiles = allFilePaths.length

        const limitedPaths = allFilePaths.slice(0, options.maxFiles)
        if (allFilePaths.length > options.maxFiles) {
          addSkipped('max-files-limit')
          skippedReasons['max-files-limit'] = allFilePaths.length - options.maxFiles
        }

        const readFileWithLimit = (fileInfo: {
          fullPath: string
          relativePath: string
          extension: string
        }): Effect.Effect<ProjectFile | null, PlatformError> =>
          Effect.gen(function* () {
            const stat = yield* fs.stat(fileInfo.fullPath)
            const sizeBytes = Number(stat.size)

            if (sizeBytes > options.maxFileBytes) {
              addSkipped('file-too-large')
              return null
            }

            const content = yield* fs.readFileString(fileInfo.fullPath)

            return {
              path: fileInfo.fullPath,
              relativePath: fileInfo.relativePath,
              content,
              extension: fileInfo.extension,
              sizeBytes,
            }
          })

        const results = yield* Effect.all(limitedPaths.map(readFileWithLimit), {
          concurrency: options.concurrency,
        })

        const files = results.filter((f): f is ProjectFile => f !== null)

        const skippedFiles = totalFiles - files.length

        return {
          files,
          totalFiles,
          skippedFiles,
          skippedReasons,
        }
      })

    return {scanProject}
  })
)

export const isCodeFile = (extension: string): boolean => CODE_EXTENSIONS.has(extension)

export const isIgnoredDirectory = (name: string): boolean => IGNORE_DIRS.has(name)

export const getFileSummary = (files: ReadonlyArray<ProjectFile>): Record<string, number> => {
  const summary: Record<string, number> = {}

  for (const file of files) {
    const ext = file.extension || 'no-extension'
    summary[ext] = (summary[ext] || 0) + 1
  }

  return summary
}
