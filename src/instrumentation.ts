// Runs once as the server starts, before it answers anything.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Card details for EDHREC's lists, from Scryfall's daily file kept on the computer.
  const { keepDailyFileFresh } = await import("@/lib/trends/local");
  keepDailyFileFresh();
}
