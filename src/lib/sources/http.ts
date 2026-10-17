// Identifies us to the sites we query; Scryfall requires a User-Agent. Set
// APP_URL in production so site owners can see who is calling.
const contact = process.env.APP_URL ? `+${process.env.APP_URL}; ` : "";
export const USER_AGENT = `CommanderPH/0.1 (${contact}MTG Commander price lookup for PH players)`;

/** Give up on a source after this long so a slow site can't hang a page. */
const TIMEOUT_MS = 10_000;

export class SourceError extends Error {
  constructor(source: string, message: string) {
    super(`${source}: ${message}`);
  }
}

/**
 * Logs a failed lookup to the server log (Vercel: the project's Logs page) and
 * returns a short reason that's safe to show, e.g. "TCGph: HTTP 403".
 */
export function reportSourceError(where: string, error: unknown): string {
  console.error(`[${where}]`, error);
  return error instanceof SourceError ? error.message : "unexpected error";
}

/** fetch() with our User-Agent and a timeout; network failures become SourceErrors. */
export async function sourceFetch(source: string, url: string, accept: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new SourceError(source, timedOut ? `no answer within ${TIMEOUT_MS / 1000}s` : "network error");
  }
}
