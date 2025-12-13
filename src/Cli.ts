import * as Args from '@effect/cli/Args'
import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import {AiLive, DEFAULT_MODEL} from './config/Bedrock.js'
import {CliConfig} from './config/CliConfig.js'
import {Review, ReviewLive} from './services/Review.js'
import {File, FileLive, getFileSummary, defaultScanOptions} from './services/File.js'
import {Stats, StatsLive, formatRepoInfo} from './services/Stats.js'
import {Report, ReportLive} from './services/Report.js'

const ServicesLive = Layer.mergeAll(
  FileLive,
  StatsLive,
  ReportLive,
  ReviewLive.pipe(Layer.provide(AiLive))
)

const makeAppLayer = (model: string) =>
  ServicesLive.pipe(Layer.provide(Layer.succeed(CliConfig, {model})))

const directoryArg = Args.directory({
  name: 'directory',
  exists: 'yes',
}).pipe(Args.withDescription('The directory to review'))

const formatOption = Options.choice('format', ['console', 'markdown']).pipe(
  Options.withAlias('f'),
  Options.withDefault('console' as const),
  Options.withDescription('Output format for the report')
)

const outOption = Options.file('out').pipe(
  Options.withAlias('o'),
  Options.optional,
  Options.withDescription('Write report to file instead of stdout')
)

const modelOption = Options.text('model').pipe(
  Options.withAlias('m'),
  Options.withDefault(DEFAULT_MODEL),
  Options.withDescription('Bedrock model ID to use')
)

const concurrencyOption = Options.integer('concurrency').pipe(
  Options.withAlias('c'),
  Options.withDefault(defaultScanOptions.concurrency),
  Options.withDescription('Number of files to process concurrently')
)

const ignoreOption = Options.text('ignore').pipe(
  Options.repeated,
  Options.withAlias('i'),
  Options.withDescription('Glob pattern to ignore (can be repeated)')
)

const noAiOption = Options.boolean('no-ai').pipe(
  Options.withDefault(true),
  Options.withDescription('Skip AI analysis, only show repo detection')
)

export interface CliOptions {
  readonly directory: string
  readonly format: 'console' | 'markdown'
  readonly out: Option.Option<string>
  readonly model: string
  readonly concurrency: number
  readonly ignore: ReadonlyArray<string>
  readonly noAi: boolean
}

const gradeCommand = Command.make(
  'ai-grader',
  {
    directory: directoryArg,
    format: formatOption,
    out: outOption,
    model: modelOption,
    concurrency: concurrencyOption,
    ignore: ignoreOption,
    noAi: noAiOption,
  },
  opts =>
    Effect.gen(function* () {
      const file = yield* File
      const stats = yield* Stats
      const review = yield* Review
      const report = yield* Report
      const fs = yield* FileSystem.FileSystem

      yield* Console.log(`\n🔍 Scanning project: ${opts.directory}`)

      const repoInfo = yield* stats.detectRepo(opts.directory)

      yield* Console.log('')
      yield* Console.log(formatRepoInfo(repoInfo))
      yield* Console.log('')

      const snapshot = yield* file.scanProject(opts.directory, {
        concurrency: opts.concurrency,
        ignorePatterns: opts.ignore,
      })

      if (snapshot.files.length === 0) {
        yield* Console.log('❌ No code files found in the specified directory.')
        return
      }

      yield* Console.log(
        `📁 Found ${snapshot.totalFiles} files, analyzing ${snapshot.files.length}`
      )

      if (snapshot.skippedFiles > 0) {
        yield* Console.log(`⏭️  Skipped ${snapshot.skippedFiles} files`)
        for (const [reason, count] of Object.entries(snapshot.skippedReasons)) {
          yield* Console.log(`   - ${reason}: ${count}`)
        }
      }

      const summary = getFileSummary(snapshot.files)
      yield* Console.log('\nFile breakdown:')
      for (const [ext, count] of Object.entries(summary)) {
        yield* Console.log(`  ${ext}: ${count} files`)
      }
      yield* Console.log('')

      yield* Console.log('Files to analyze:')
      for (const f of snapshot.files.slice(0, 20)) {
        yield* Console.log(`  - ${f.relativePath}`)
      }
      if (snapshot.files.length > 20) {
        yield* Console.log(`  ... and ${snapshot.files.length - 20} more`)
      }
      yield* Console.log('')

      if (opts.noAi) {
        yield* Console.log('✅ Repo detection complete (AI analysis skipped)')
        return
      }

      yield* Console.log(`🤖 Analyzing code with AI (model: ${opts.model})...`)
      const result = yield* review.analyzeProject(snapshot.files)

      let output: string

      if (opts.format === 'markdown') {
        output = yield* report.generateMarkdownReport(result)
      } else {
        yield* report.generateConsoleReport(result)
        output = ''
      }

      if (Option.isSome(opts.out)) {
        const content =
          opts.format === 'console' ? yield* report.generateMarkdownReport(result) : output
        yield* fs.writeFileString(opts.out.value, content)
        yield* Console.log(`📄 Report written to ${opts.out.value}`)
      } else if (output) {
        yield* Console.log(output)
      }

      yield* Console.log('✅ Analysis complete!')
    }).pipe(Effect.provide(makeAppLayer(opts.model)))
)

export const cli = Command.run(gradeCommand, {
  name: 'AI Grader',
  version: '1.0.0',
})
