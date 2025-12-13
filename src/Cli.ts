import * as Args from "@effect/cli/Args"
import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"

import { FileScanner, getFileSummary } from "./services/FileScanner.js"
import { CodeAnalyzer } from "./services/CodeAnalyzer.js"
import { ReportGenerator } from "./services/ReportGenerator.js"

const directoryArg = Args.directory({
  name: "directory",
  exists: "yes"
}).pipe(Args.withDescription("The directory to review"))

const outputOption = Options.choice("output", ["console", "markdown"]).pipe(
  Options.withAlias("o"),
  Options.withDefault("console" as const),
  Options.withDescription("Output format for the report")
)

const verboseOption = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable verbose output")
)

const gradeCommand = Command.make(
  "ai-grader",
  { directory: directoryArg, output: outputOption, verbose: verboseOption },
  ({ directory, output, verbose }) =>
    Effect.gen(function* () {
      const fileScanner = yield* FileScanner
      const codeAnalyzer = yield* CodeAnalyzer
      const reportGenerator = yield* ReportGenerator

      yield* Console.log(`\n🔍 Scanning project: ${directory}`)
      const files = yield* fileScanner.scanProject(directory)

      if (files.length === 0) {
        yield* Console.log("❌ No code files found in the specified directory.")
        return
      }

      yield* Console.log(`📁 Found ${files.length} files to analyze`)

      if (verbose) {
        const summary = getFileSummary(files)
        yield* Console.log("\nFile breakdown:")
        for (const [ext, count] of Object.entries(summary)) {
          yield* Console.log(`  ${ext}: ${count} files`)
        }
        yield* Console.log("")

        yield* Console.log("Files to analyze:")
        for (const file of files.slice(0, 20)) {
          yield* Console.log(`  - ${file.relativePath}`)
        }
        if (files.length > 20) {
          yield* Console.log(`  ... and ${files.length - 20} more`)
        }
        yield* Console.log("")
      }

      yield* Console.log("🤖 Analyzing code with AI (this may take a moment)...")
      const review = yield* codeAnalyzer.analyzeProject(files)

      if (output === "markdown") {
        const markdown = yield* reportGenerator.generateMarkdownReport(review)
        yield* Console.log(markdown)
      } else {
        yield* reportGenerator.generateConsoleReport(review)
      }

      yield* Console.log("✅ Analysis complete!")
    })
)

export const run = Command.run(gradeCommand, {
  name: "AI Grader",
  version: "1.0.0"
})
