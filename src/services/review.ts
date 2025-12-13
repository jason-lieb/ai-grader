import * as AiError from '@effect/ai/AiError'
import * as LanguageModel from '@effect/ai/LanguageModel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import {
  FileReview,
  FileReviewResponse,
  Issue,
  ProjectReview,
  ProjectSummaryResponse,
} from '../schemas/review-result.js'
import type {ProjectFile} from './file.js'

const SYSTEM_PROMPT = `You are an expert code reviewer specializing in Node.js and TypeScript applications.
Your task is to analyze code for:

1. **Security vulnerabilities**: SQL injection, XSS, authentication issues, sensitive data exposure, insecure dependencies
2. **Performance issues**: N+1 queries, memory leaks, inefficient algorithms, blocking operations
3. **Maintainability concerns**: Code complexity, poor naming, lack of documentation, tight coupling
4. **Error handling**: Uncaught exceptions, missing error boundaries, improper async error handling
5. **Best practices**: Effect-TS patterns, functional programming, proper typing, SOLID principles
6. **Type safety**: Any types, type assertions, missing type annotations, unsafe casts

Guidelines:
- Be constructive and specific with your feedback
- Prioritize the most impactful issues
- Provide actionable recommendations with code examples where helpful
- Acknowledge good patterns and practices when you see them
- Focus on issues that would improve code quality, not stylistic preferences`

const MAX_FILE_SIZE = 15000
const MAX_FILES_PER_BATCH = 20

export interface ReviewService {
  readonly analyzeProject: (
    files: ReadonlyArray<ProjectFile>
  ) => Effect.Effect<ProjectReview, AiError.AiError>

  readonly analyzeFile: (
    file: ProjectFile,
    projectContext?: string
  ) => Effect.Effect<FileReview, AiError.AiError>
}

export class Review extends Context.Tag('Review')<Review, ReviewService>() {}

export const ReviewLive: Layer.Layer<Review, never, LanguageModel.LanguageModel> =
  Layer.effect(
    Review,
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel

      const analyzeFile = (
        file: ProjectFile,
        projectContext?: string
      ): Effect.Effect<FileReview, AiError.AiError> =>
        Effect.gen(function* () {
          const contextSection = projectContext ? `\n\nProject Context:\n${projectContext}` : ''

          const userPrompt = `Review the following file: ${file.relativePath}${contextSection}

\`\`\`${file.extension.slice(1)}
${file.content}
\`\`\`

Analyze this code and provide a structured review. Focus on the most important issues and be specific with your recommendations.`

          const response = yield* model.generateObject({
            prompt: [
              {role: 'system', content: SYSTEM_PROMPT},
              {role: 'user', content: userPrompt},
            ],
            schema: FileReviewResponse,
            objectName: 'FileReview',
          })

          return new FileReview({
            file: file.relativePath,
            summary: response.value.summary,
            issues: response.value.issues.map(
              issue =>
                new Issue({
                  severity: issue.severity,
                  category: issue.category,
                  file: file.relativePath,
                  line: Option.fromNullable(issue.line),
                  description: issue.description,
                  recommendation: issue.recommendation,
                  codeSnippet: Option.fromNullable(issue.codeSnippet),
                })
            ),
            positives: response.value.positives,
          })
        })

      const analyzeProject = (
        files: ReadonlyArray<ProjectFile>
      ): Effect.Effect<ProjectReview, AiError.AiError> =>
        Effect.gen(function* () {
          const filesToAnalyze = files
            .filter(file => file.content.length <= MAX_FILE_SIZE)
            .slice(0, MAX_FILES_PER_BATCH)

          const skippedCount = files.length - filesToAnalyze.length
          if (skippedCount > 0) {
            yield* Effect.logWarning(
              `Skipping ${skippedCount} files (too large or exceeds batch limit)`
            )
          }

          const packageJson = files.find(f => f.relativePath === 'package.json')
          const projectContext = packageJson
            ? `This is a Node.js project. Here's the package.json:\n${packageJson.content.slice(0, 2000)}`
            : undefined

          yield* Effect.logInfo(`Analyzing ${filesToAnalyze.length} files...`)

          const fileReviews: FileReview[] = []
          for (const file of filesToAnalyze) {
            yield* Effect.logDebug(`Analyzing: ${file.relativePath}`)
            const review = yield* analyzeFile(file, projectContext)
            fileReviews.push(review)
          }

          yield* Effect.logInfo('Generating project summary...')

          const summaryPrompt = buildSummaryPrompt(fileReviews)

          const summaryResponse = yield* model.generateObject({
            prompt: [
              {role: 'system', content: SYSTEM_PROMPT},
              {role: 'user', content: summaryPrompt},
            ],
            schema: ProjectSummaryResponse,
            objectName: 'ProjectSummary',
          })

          return new ProjectReview({
            overallScore: summaryResponse.value.overallScore,
            summary: summaryResponse.value.summary,
            fileReviews,
            topIssues: summaryResponse.value.topIssues.map(
              issue =>
                new Issue({
                  severity: issue.severity,
                  category: issue.category,
                  file: issue.file,
                  line: Option.none(),
                  description: issue.description,
                  recommendation: issue.recommendation,
                  codeSnippet: Option.none(),
                })
            ),
            recommendations: summaryResponse.value.recommendations,
          })
        })

      return {analyzeFile, analyzeProject}
    })
  )

const buildSummaryPrompt = (fileReviews: ReadonlyArray<FileReview>): string => {
  const reviewSummaries = fileReviews
    .map(review => {
      const issueCount = review.issues.length
      const criticalCount = review.issues.filter(i => i.severity === 'critical').length
      const warningCount = review.issues.filter(i => i.severity === 'warning').length

      return `### ${review.file}
Summary: ${review.summary}
Issues: ${issueCount} total (${criticalCount} critical, ${warningCount} warnings)
${
  review.issues.length > 0
    ? `Top issues:\n${review.issues
        .slice(0, 3)
        .map(i => `- [${i.severity}] ${i.description}`)
        .join('\n')}`
    : 'No issues found.'
}
Positives: ${review.positives.slice(0, 2).join(', ') || 'None noted'}`
    })
    .join('\n\n')

  return `Based on the following individual file reviews, provide an overall project assessment.

## File Reviews

${reviewSummaries}

## Your Task

Provide a comprehensive project review including:
1. An overall score from 1-10 (where 10 is excellent)
2. A summary of the project's overall code quality (2-3 sentences)
3. The top 5 most critical issues across all files (prioritize security and bugs)
4. Key recommendations for improving the project (3-5 actionable items)

Be honest but constructive in your assessment.`
}

