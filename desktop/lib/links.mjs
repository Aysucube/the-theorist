// Which links stay in the app's window and which go to the computer's browser.

/** A page of the app's own server, shown in its window. */
export function isAppUrl(url, appOrigin) {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

/** Links the computer's browser may open: web pages and email, never anything that could start a program. */
export function canOpenOutside(url) {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
