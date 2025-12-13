import * as Schema from "effect/Schema"

export const Severity = Schema.Literal("critical", "warning", "suggestion")
export type Severity = typeof Severity.Type

export const Category = Schema.Literal(
  "security",
  "performance",
  "maintainability",
  "error-handling",
  "best-practices",
  "type-safety"
)
export type Category = typeof Category.Type

export class Issue extends Schema.Class<Issue>("Issue")({
  severity: Severity,
  category: Category,
  file: Schema.String,
  line: Schema.optionalWith(Schema.Number, { as: "Option" }),
  description: Schema.String,
  recommendation: Schema.String,
  codeSnippet: Schema.optionalWith(Schema.String, { as: "Option" })
}) {}

export class FileReview extends Schema.Class<FileReview>("FileReview")({
  file: Schema.String,
  summary: Schema.String,
  issues: Schema.Array(Issue),
  positives: Schema.Array(Schema.String)
}) {}

export class ProjectReview extends Schema.Class<ProjectReview>("ProjectReview")({
  overallScore: Schema.Number.pipe(Schema.int(), Schema.between(1, 10)),
  summary: Schema.String,
  fileReviews: Schema.Array(FileReview),
  topIssues: Schema.Array(Issue),
  recommendations: Schema.Array(Schema.String)
}) {}

export class FileReviewRequest extends Schema.Class<FileReviewRequest>("FileReviewRequest")({
  filePath: Schema.String,
  extension: Schema.String,
  content: Schema.String,
  projectContext: Schema.optionalWith(Schema.String, { as: "Option" })
}) {}

export class FileReviewResponse extends Schema.Class<FileReviewResponse>("FileReviewResponse")({
  summary: Schema.String,
  issues: Schema.Array(
    Schema.Struct({
      severity: Severity,
      category: Category,
      line: Schema.optional(Schema.Number),
      description: Schema.String,
      recommendation: Schema.String,
      codeSnippet: Schema.optional(Schema.String)
    })
  ),
  positives: Schema.Array(Schema.String)
}) {}

export class ProjectSummaryResponse extends Schema.Class<ProjectSummaryResponse>(
  "ProjectSummaryResponse"
)({
  overallScore: Schema.Number.pipe(Schema.int(), Schema.between(1, 10)),
  summary: Schema.String,
  topIssues: Schema.Array(
    Schema.Struct({
      severity: Severity,
      category: Category,
      file: Schema.String,
      description: Schema.String,
      recommendation: Schema.String
    })
  ),
  recommendations: Schema.Array(Schema.String)
}) {}
