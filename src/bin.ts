#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as HttpClient from "@effect/platform-node/NodeHttpClient"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { run } from "./Cli.js"
import { AiLive } from "./config/Bedrock.js"
import { FileScannerLive } from "./services/FileScanner.js"
import { CodeAnalyzerLive } from "./services/CodeAnalyzer.js"
import { ReportGeneratorLive } from "./services/ReportGenerator.js"

const PlatformLive = Layer.mergeAll(
  NodeContext.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  HttpClient.layerUndici
)

const AiLayerLive = AiLive.pipe(
  Layer.provide(HttpClient.layerUndici)
)

const ServicesLive = Layer.mergeAll(
  FileScannerLive,
  ReportGeneratorLive,
  CodeAnalyzerLive.pipe(Layer.provide(AiLayerLive))
).pipe(
  Layer.provide(PlatformLive)
)

const AppLive = Layer.mergeAll(
  ServicesLive,
  PlatformLive
)

run(process.argv).pipe(
  Effect.provide(AppLive),
  NodeRuntime.runMain({ disableErrorReporting: false })
)
