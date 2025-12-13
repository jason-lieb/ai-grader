import type * as HttpClient from "@effect/platform/HttpClient"
import * as LanguageModel from "@effect/ai/LanguageModel"
import * as AmazonBedrockClient from "@effect/ai-amazon-bedrock/AmazonBedrockClient"
import * as AmazonBedrockLanguageModel from "@effect/ai-amazon-bedrock/AmazonBedrockLanguageModel"
import * as Config from "effect/Config"
import type { ConfigError } from "effect/ConfigError"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

const BedrockConfigSchema = Config.all({
  accessKeyId: Config.string("AWS_ACCESS_KEY_ID"),
  secretAccessKey: Config.redacted("AWS_SECRET_ACCESS_KEY"),
  sessionToken: Config.option(Config.redacted("AWS_SESSION_TOKEN")),
  region: Config.withDefault(Config.string("AWS_REGION"), "us-east-1")
})

export const BedrockClientLive: Layer.Layer<
  AmazonBedrockClient.AmazonBedrockClient,
  ConfigError,
  HttpClient.HttpClient
> = Layer.unwrapEffect(
  Effect.map(BedrockConfigSchema, (config) =>
    AmazonBedrockClient.layer({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: Option.match(config.sessionToken, {
        onNone: () => undefined,
        onSome: (token) => token
      }),
      region: config.region
    })
  )
)

export const DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0" as const

export const makeLanguageModelLayer = (
  model: string = DEFAULT_MODEL
): Layer.Layer<
  LanguageModel.LanguageModel,
  never,
  AmazonBedrockClient.AmazonBedrockClient
> =>
  AmazonBedrockLanguageModel.layer({
    model,
    config: {
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.3 // Lower temperature for more consistent, deterministic analysis
      }
    }
  })

export const LanguageModelLive = makeLanguageModelLayer(DEFAULT_MODEL)

export const AiLive = LanguageModelLive.pipe(Layer.provide(BedrockClientLive))
