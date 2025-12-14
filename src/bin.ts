import * as NodeContext from '@effect/platform-node/NodeContext'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as HttpClient from '@effect/platform-node/NodeHttpClient'
import * as NodePath from '@effect/platform-node/NodePath'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {cli} from './cli.js'

const PlatformLive = Layer.mergeAll(
  NodeContext.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  HttpClient.layerUndici
)

cli(process.argv).pipe(Effect.provide(PlatformLive), NodeRuntime.runMain())
