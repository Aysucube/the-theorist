// Identifies us to the sites we query. Scryfall requires a User-Agent.
export const USER_AGENT = "CommanderPH/0.1 (MTG Commander price lookup for PH players)";

export class SourceError extends Error {
  constructor(source: string, message: string) {
    super(`${source}: ${message}`);
  }
}
