import { connection } from "next/server";
import { isSameComputer, readSaved, savingOnComputer, writeSaved } from "@/lib/saved-data";
import { isSavedKey, isSavedValue } from "@/lib/saved-shape";

// GET /api/saved/binder (or /decks): the computer's copy, { savedAt, value }.
// PUT /api/saved/binder: keeps a newer copy; an older one gets the newer back.
// Only when The Theorist runs on your own computer (see lib/saved-data.ts);
// otherwise 404, and the browser keeps its own copy alone.

const MAX_BYTES = 8 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const unavailable = () => Response.json({ error: "Saving on the computer isn't on here." }, { status: 404, headers: NO_STORE });

export async function GET(request: Request, ctx: RouteContext<"/api/saved/[key]">) {
  await connection();
  const { key } = await ctx.params;
  if (!savingOnComputer() || !isSameComputer(request) || !isSavedKey(key)) return unavailable();
  return Response.json((await readSaved(key)) ?? { savedAt: 0, value: null }, { headers: NO_STORE });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/saved/[key]">) {
  const { key } = await ctx.params;
  if (!savingOnComputer() || !isSameComputer(request) || !isSavedKey(key)) return unavailable();

  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Too large." }, { status: 413, headers: NO_STORE });
  let body: { savedAt?: unknown; value?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Not JSON." }, { status: 400, headers: NO_STORE });
  }
  if (typeof body.savedAt !== "number" || !isSavedValue(key, body.value)) {
    return Response.json({ error: "Not a valid copy." }, { status: 400, headers: NO_STORE });
  }

  // Another tab (or another port) saved something newer: send that back instead of overwriting it.
  const current = await readSaved(key);
  if (current && current.savedAt > body.savedAt) return Response.json({ stale: true, ...current }, { headers: NO_STORE });

  try {
    await writeSaved(key, { savedAt: body.savedAt, value: body.value });
  } catch (error) {
    console.error("api/saved", error);
    return Response.json({ error: "Couldn't write the file." }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true, savedAt: body.savedAt }, { headers: NO_STORE });
}
