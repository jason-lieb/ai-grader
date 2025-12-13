import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { Issue, ProjectReview } from "../schemas/ReviewResult.js"

const SEVERITY_EMOJI = {
  critical: "🔴",
  warning: "🟡",
  suggestion: "🟢"
} as const

const CATEGORY_EMOJI = {
  security: "🔒",
  performance: "⚡",
  maintainability: "🔧",
  "error-handling": "⚠️",
  "best-practices": "✨",
  "type-safety": "📝"
} as const

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m"
} as const

export interface ReportGeneratorService {
  readonly generateConsoleReport: (review: ProjectReview) => Effect.Effect<void>
  readonly generateMarkdownReport: (review: ProjectReview) => Effect.Effect<string>
}

export class ReportGenerator extends Context.Tag("ReportGenerator")<
  ReportGenerator,
  ReportGeneratorService
>() {}

export const ReportGeneratorLive: Layer.Layer<ReportGenerator> = Layer.succeed(
  ReportGenerator,
  {
    generateConsoleReport: (review: ProjectReview) =>
      Effect.gen(function* () {
        const lines: string[] = []

        lines.push("")
        lines.push(`${COLORS.bold}${"═".repeat(60)}${COLORS.reset}`)
        lines.push(
          `${COLORS.bold}${COLORS.cyan}📊 AI GRADER CODE REVIEW REPORT${COLORS.reset}`
        )
        lines.push(`${COLORS.bold}${"═".repeat(60)}${COLORS.reset}`)
        lines.push("")

        const scoreColor = getScoreColor(review.overallScore)
        const scoreBar = generateScoreBar(review.overallScore)
        lines.push(
          `${COLORS.bold}Overall Score:${COLORS.reset} ${scoreColor}[${scoreBar}] ${review.overallScore}/10${COLORS.reset}`
        )
        lines.push("")

        lines.push(`${COLORS.bold}${COLORS.blue}📋 Summary${COLORS.reset}`)
        lines.push(`${COLORS.dim}${"─".repeat(40)}${COLORS.reset}`)
        lines.push(review.summary)
        lines.push("")

        const stats = calculateStats(review)
        lines.push(`${COLORS.bold}${COLORS.blue}📈 Statistics${COLORS.reset}`)
        lines.push(`${COLORS.dim}${"─".repeat(40)}${COLORS.reset}`)
        lines.push(`Files analyzed: ${stats.filesAnalyzed}`)
        lines.push(
          `Total issues: ${stats.totalIssues} (${COLORS.red}${stats.criticalCount} critical${COLORS.reset}, ${COLORS.yellow}${stats.warningCount} warnings${COLORS.reset}, ${COLORS.green}${stats.suggestionCount} suggestions${COLORS.reset})`
        )
        lines.push("")

        if (review.topIssues.length > 0) {
          lines.push(
            `${COLORS.bold}${COLORS.red}🚨 Top Issues${COLORS.reset}`
          )
          lines.push(`${COLORS.dim}${"─".repeat(40)}${COLORS.reset}`)

          for (const issue of review.topIssues) {
            lines.push(formatIssueForConsole(issue))
            lines.push("")
          }
        }

        lines.push(
          `${COLORS.bold}${COLORS.blue}📁 File Reviews${COLORS.reset}`
        )
        lines.push(`${COLORS.dim}${"─".repeat(40)}${COLORS.reset}`)

        for (const fileReview of review.fileReviews) {
          const fileIssueCount = fileReview.issues.length
          const fileCritical = fileReview.issues.filter(
            (i) => i.severity === "critical"
          ).length

          const statusIcon =
            fileCritical > 0 ? "🔴" : fileIssueCount > 0 ? "🟡" : "🟢"

          lines.push(
            `${statusIcon} ${COLORS.bold}${fileReview.file}${COLORS.reset}`
          )
          lines.push(`   ${COLORS.dim}${fileReview.summary}${COLORS.reset}`)
          lines.push(
            `   Issues: ${fileIssueCount} | Positives: ${fileReview.positives.length}`
          )
        }
        lines.push("")

        if (review.recommendations.length > 0) {
          lines.push(
            `${COLORS.bold}${COLORS.green}💡 Recommendations${COLORS.reset}`
          )
          lines.push(`${COLORS.dim}${"─".repeat(40)}${COLORS.reset}`)

          for (const rec of review.recommendations) {
            lines.push(`${COLORS.cyan}•${COLORS.reset} ${rec}`)
          }
          lines.push("")
        }

        lines.push(`${COLORS.bold}${"═".repeat(60)}${COLORS.reset}`)
        lines.push("")

        yield* Effect.log(lines.join("\n"))
      }),

    generateMarkdownReport: (review: ProjectReview) =>
      Effect.succeed(generateMarkdown(review))
  }
)

const getScoreColor = (score: number): string => {
  if (score >= 8) return COLORS.green
  if (score >= 5) return COLORS.yellow
  return COLORS.red
}

const generateScoreBar = (score: number): string => {
  const filled = "█".repeat(score)
  const empty = "░".repeat(10 - score)
  return filled + empty
}

const formatIssueForConsole = (issue: Issue): string => {
  const severityEmoji = SEVERITY_EMOJI[issue.severity]
  const categoryEmoji = CATEGORY_EMOJI[issue.category]
  const severityColor =
    issue.severity === "critical"
      ? COLORS.red
      : issue.severity === "warning"
        ? COLORS.yellow
        : COLORS.green

  const lines = [
    `${severityEmoji} ${categoryEmoji} ${severityColor}[${issue.severity.toUpperCase()}]${COLORS.reset} ${COLORS.dim}${issue.file}${COLORS.reset}`,
    `   ${issue.description}`,
    `   ${COLORS.cyan}→${COLORS.reset} ${issue.recommendation}`
  ]

  const codeSnippet = Option.getOrUndefined(issue.codeSnippet)
  if (codeSnippet) {
    lines.push(`   ${COLORS.dim}Code: ${codeSnippet.slice(0, 100)}...${COLORS.reset}`)
  }

  return lines.join("\n")
}

const calculateStats = (
  review: ProjectReview
): {
  filesAnalyzed: number
  totalIssues: number
  criticalCount: number
  warningCount: number
  suggestionCount: number
} => {
  const allIssues = review.fileReviews.flatMap((fr) => fr.issues)

  return {
    filesAnalyzed: review.fileReviews.length,
    totalIssues: allIssues.length,
    criticalCount: allIssues.filter((i) => i.severity === "critical").length,
    warningCount: allIssues.filter((i) => i.severity === "warning").length,
    suggestionCount: allIssues.filter((i) => i.severity === "suggestion").length
  }
}

const generateMarkdown = (review: ProjectReview): string => {
  const stats = calculateStats(review)

  const sections: string[] = []

  sections.push("# 📊 AI Grader Code Review Report")
  sections.push("")

  const scoreEmoji = review.overallScore >= 8 ? "🟢" : review.overallScore >= 5 ? "🟡" : "🔴"
  sections.push(`## ${scoreEmoji} Overall Score: ${review.overallScore}/10`)
  sections.push("")
  sections.push(review.summary)
  sections.push("")

  sections.push("## 📈 Statistics")
  sections.push("")
  sections.push("| Metric | Value |")
  sections.push("|--------|-------|")
  sections.push(`| Files Analyzed | ${stats.filesAnalyzed} |`)
  sections.push(`| Total Issues | ${stats.totalIssues} |`)
  sections.push(`| Critical | ${stats.criticalCount} |`)
  sections.push(`| Warnings | ${stats.warningCount} |`)
  sections.push(`| Suggestions | ${stats.suggestionCount} |`)
  sections.push("")

  if (review.topIssues.length > 0) {
    sections.push("## 🚨 Top Issues")
    sections.push("")

    for (const issue of review.topIssues) {
      sections.push(formatIssueForMarkdown(issue))
      sections.push("")
    }
  }

  sections.push("## 📁 File Reviews")
  sections.push("")

  for (const fileReview of review.fileReviews) {
    const fileIssueCount = fileReview.issues.length
    const statusIcon =
      fileReview.issues.some((i) => i.severity === "critical")
        ? "🔴"
        : fileIssueCount > 0
          ? "🟡"
          : "🟢"

    sections.push(`### ${statusIcon} \`${fileReview.file}\``)
    sections.push("")
    sections.push(fileReview.summary)
    sections.push("")

    if (fileReview.issues.length > 0) {
      sections.push("**Issues:**")
      sections.push("")
      for (const issue of fileReview.issues) {
        const emoji = SEVERITY_EMOJI[issue.severity]
        const line = Option.getOrUndefined(issue.line)
        const lineInfo = line ? ` (line ${line})` : ""
        sections.push(
          `- ${emoji} **${issue.category}**${lineInfo}: ${issue.description}`
        )
      }
      sections.push("")
    }

    if (fileReview.positives.length > 0) {
      sections.push("**Positives:**")
      sections.push("")
      for (const positive of fileReview.positives) {
        sections.push(`- ✅ ${positive}`)
      }
      sections.push("")
    }
  }

  if (review.recommendations.length > 0) {
    sections.push("## 💡 Recommendations")
    sections.push("")
    for (const rec of review.recommendations) {
      sections.push(`- ${rec}`)
    }
    sections.push("")
  }

  sections.push("---")
  sections.push("*Generated by AI Grader*")

  return sections.join("\n")
}

const formatIssueForMarkdown = (issue: Issue): string => {
  const severityEmoji = SEVERITY_EMOJI[issue.severity]
  const categoryEmoji = CATEGORY_EMOJI[issue.category]
  const line = Option.getOrUndefined(issue.line)
  const lineInfo = line ? ` (line ${line})` : ""

  const lines = [
    `### ${severityEmoji} ${categoryEmoji} ${issue.severity.toUpperCase()} - ${issue.category}`,
    "",
    `**File:** \`${issue.file}\`${lineInfo}`,
    "",
    issue.description,
    "",
    `**Recommendation:** ${issue.recommendation}`
  ]

  const codeSnippet = Option.getOrUndefined(issue.codeSnippet)
  if (codeSnippet) {
    lines.push("")
    lines.push("```")
    lines.push(codeSnippet)
    lines.push("```")
  }

  return lines.join("\n")
}
