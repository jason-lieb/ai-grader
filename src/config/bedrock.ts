import * as AmazonBedrockClient from '@effect/ai-amazon-bedrock/AmazonBedrockClient'
import * as AmazonBedrockLanguageModel from '@effect/ai-amazon-bedrock/AmazonBedrockLanguageModel'
import * as LanguageModel from '@effect/ai/LanguageModel'
import type * as HttpClient from '@effect/platform/HttpClient'
import * as Config from 'effect/Config'
import type {ConfigError} from 'effect/ConfigError'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import {Cli} from './cli.js'

export const DEFAULT_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0' as const

const BedrockCredentialsSchema = Config.all({
  accessKeyId: Config.string('AWS_ACCESS_KEY_ID'),
  secretAccessKey: Config.redacted('AWS_SECRET_ACCESS_KEY'),
  sessionToken: Config.option(Config.redacted('AWS_SESSION_TOKEN')),
  region: Config.withDefault(Config.string('AWS_REGION'), 'us-east-1'),
})

const BedrockClientLive: Layer.Layer<
  AmazonBedrockClient.AmazonBedrockClient,
  ConfigError,
  HttpClient.HttpClient
> = Layer.unwrapEffect(
  Effect.map(BedrockCredentialsSchema, creds =>
    AmazonBedrockClient.layer({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: Option.match(creds.sessionToken, {
        onNone: () => undefined,
        onSome: token => token,
      }),
      region: creds.region,
    })
  )
)

export const AiLive: Layer.Layer<
  LanguageModel.LanguageModel,
  ConfigError,
  HttpClient.HttpClient | Cli
> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* Cli

    return AmazonBedrockLanguageModel.layer({
      model: config.model,
      config: {
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.3,
        },
      },
    }).pipe(Layer.provide(BedrockClientLive))
  })
)

