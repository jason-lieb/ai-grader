import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import type { PlatformError } from "@effect/platform/Error"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export interface ProjectFile {
  readonly path: string
  readonly relativePath: string
  readonly content: string
  readonly extension: string
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml"
])

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  ".output",
  ".nuxt",
  ".vercel",
  ".netlify",
  "__pycache__",
  ".venv",
  "vendor"
])

const IGNORE_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock"
])

export interface FileScannerService {
  /**
   * Scans a directory recursively and returns all code files.
   */
  readonly scanProject: (
    directory: string
  ) => Effect.Effect<ReadonlyArray<ProjectFile>, PlatformError>
}

export class FileScanner extends Context.Tag("FileScanner")<
  FileScanner,
  FileScannerService
>() {}

export const FileScannerLive: Layer.Layer<
  FileScanner,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  FileScanner,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const scanProject = (
      directory: string
    ): Effect.Effect<ReadonlyArray<ProjectFile>, PlatformError> =>
      Effect.gen(function* () {
        const files: ProjectFile[] = []
        const rootDir = path.resolve(directory)

        const scanDir = (
          dir: string
        ): Effect.Effect<void, PlatformError> =>
          Effect.gen(function* () {
            const entries = yield* fs.readDirectory(dir)

            for (const entry of entries) {
              const fullPath = path.join(dir, entry)
              const stat = yield* fs.stat(fullPath)

              if (stat.type === "Directory") {
                if (!IGNORE_DIRS.has(entry)) {
                  yield* scanDir(fullPath)
                }
              } else if (stat.type === "File") {
                if (IGNORE_FILES.has(entry)) {
                  continue
                }

                const ext = path.extname(entry)

                if (CODE_EXTENSIONS.has(ext)) {
                  const content = yield* fs.readFileString(fullPath)
                  const relativePath = path.relative(rootDir, fullPath)

                  files.push({
                    path: fullPath,
                    relativePath,
                    content,
                    extension: ext
                  })
                }
              }
            }
          })

        yield* scanDir(rootDir)

        return files
      })

    return { scanProject }
  })
)

export const isCodeFile = (extension: string): boolean =>
  CODE_EXTENSIONS.has(extension)

export const isIgnoredDirectory = (name: string): boolean =>
  IGNORE_DIRS.has(name)

export const getFileSummary = (
  files: ReadonlyArray<ProjectFile>
): Record<string, number> => {
  const summary: Record<string, number> = {}

  for (const file of files) {
    const ext = file.extension || "no-extension"
    summary[ext] = (summary[ext] || 0) + 1
  }

  return summary
}
