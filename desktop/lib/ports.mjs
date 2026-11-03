// The port the app's own server listens on, on this computer only.
import net from "node:net";

/**
 * The same port every time it's free: the window's own storage (caches and the
 * like) is kept per address, so a steady port finds it again.
 */
export const PREFERRED_PORT = 47321;

function listenOn(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(null));
    server.listen(port, "127.0.0.1", () => {
      const { port: bound } = server.address();
      server.close(() => resolve(bound));
    });
  });
}

/** The preferred port, the next free one after it, or any free port. */
export async function pickPort(preferred = PREFERRED_PORT, tries = 20) {
  for (let port = preferred; port < preferred + tries; port++) {
    if ((await listenOn(port)) !== null) return port;
  }
  return (await listenOn(0)) ?? preferred;
}
