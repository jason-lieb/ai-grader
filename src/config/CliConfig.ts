import * as Context from "effect/Context"

export interface CliConfigService {
  readonly model: string
}

export class CliConfig extends Context.Tag("CliConfig")<CliConfig, CliConfigService>() {}
