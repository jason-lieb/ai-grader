import * as Context from 'effect/Context'

export interface CliService {
  readonly model: string
}

export class Cli extends Context.Tag('Cli')<Cli, CliService>() {}
