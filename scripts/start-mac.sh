# Starts The Theorist on a Mac. Run it through "Start The Theorist.command".
#
# Works on a Mac that has never run the app (e.g. from a ZIP):
# - No Node.js? It downloads a private copy from nodejs.org into the .runtime
#   folder, checked against nodejs.org's published SHA-256. Nothing is
#   installed system-wide and no admin password is needed.
# - Installs packages and builds the app only when needed (first run, or after
#   the code changed), so later starts take seconds.
# - Uses port 3000, or the next free one if another program has it.
# macOS ships bash 3.2, so this sticks to what it supports.

set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 1
# Next.js otherwise sends anonymous usage data to Vercel.
export NEXT_TELEMETRY_DISABLED=1

MIN_NODE="20.9.0"
runtime="$root/.runtime"

# Shows the problem in red and stops. (To stderr, so it shows even from inside $(...).)
fail() {
  echo "" >&2
  printf '\033[31m%s\033[0m\n' "$1" >&2
  exit 1
}

# True when a "v20.9.0"-style version is at least MIN_NODE.
version_ok() {
  local a b c x y z
  IFS=. read -r a b c <<< "${1#v}"
  IFS=. read -r x y z <<< "$MIN_NODE"
  c=${c%%[!0-9]*}
  [[ "$a" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ && "$c" =~ ^[0-9]+$ ]] || return 1
  ((a > x || (a == x && (b > y || (b == y && c >= z)))))
}

# Which Node.js release line runs on this Mac: 24 needs macOS 13.5, 22 needs macOS 11.
node_line() {
  local version major minor
  version="$(sw_vers -productVersion 2>/dev/null)"
  IFS=. read -r major minor _ <<< "$version"
  minor=${minor:-0}
  if ((major > 13 || (major == 13 && minor >= 5))); then
    echo "latest-v24.x"
  elif ((major >= 11)); then
    echo "latest-v22.x"
  else
    fail "This Mac runs macOS $version. The app needs macOS 11 (Big Sur) or newer."
  fi
}

install_private_node() {
  [ "$(uname -s)" = "Darwin" ] || fail "This launcher is for macOS. Install Node.js $MIN_NODE or newer, then run npm ci, npm run build and npm start."
  local arch line base sums hash file archive dir
  # Apple silicon reports x86_64 when Terminal runs under Rosetta, so ask the hardware.
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] || [ "$(uname -m)" = "arm64" ]; then
    arch="arm64"
  else
    arch="x64"
  fi
  line="$(node_line)" || exit 1

  echo "Node.js is not installed, so downloading a private copy for this app from nodejs.org."
  echo "This is about 50 MB and only happens once..."
  base="https://nodejs.org/dist/$line"
  sums="$(curl -fsSL --retry 3 "$base/SHASUMS256.txt")" ||
    fail "Could not reach nodejs.org to download Node.js. Check the internet connection and try again."
  hash="$(printf '%s\n' "$sums" | awk -v want="darwin-$arch.tar.gz" '$2 ~ "^node-v[0-9.]+-" want "$" { print $1; exit }')"
  file="$(printf '%s\n' "$sums" | awk -v want="darwin-$arch.tar.gz" '$2 ~ "^node-v[0-9.]+-" want "$" { print $2; exit }')"
  [ -n "$hash" ] && [ -n "$file" ] || fail "nodejs.org has no Node.js download for macOS ($arch)."

  mkdir -p "$runtime" || fail "Could not create the .runtime folder in $root."
  archive="$runtime/$file"
  curl -fL --retry 3 --progress-bar -o "$archive" "$base/$file" ||
    fail "Downloading Node.js failed. Check the internet connection and try again."
  if [ "$(shasum -a 256 "$archive" | awk '{ print $1 }')" != "$hash" ]; then
    rm -f "$archive"
    fail "The Node.js download did not match the checksum nodejs.org publishes, so it was not used. Try again."
  fi

  echo "Unpacking Node.js..."
  tar -xzf "$archive" -C "$runtime" || fail "Unpacking Node.js failed."
  rm -f "$archive"
  dir="$runtime/${file%.tar.gz}"
  [ -x "$dir/bin/node" ] || fail "Node.js was downloaded but bin/node is missing. Delete the .runtime folder and try again."
  node_dir="$dir/bin"
}

find_node() {
  local candidate dir
  # 1. A Node.js installed on this Mac (Homebrew, the nodejs.org installer, nvm...), if it's new enough.
  # PRIVATE_NODE=1 skips it, e.g. to try the first-run download.
  if [ "${PRIVATE_NODE:-}" != "1" ]; then
    for candidate in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do
      if [ -n "$candidate" ] && [ -x "$candidate" ] && version_ok "$("$candidate" -v 2>/dev/null)"; then
        node_dir="$(dirname "$candidate")"
        return
      fi
    done
  fi
  # 2. A private copy this launcher downloaded before.
  for dir in "$runtime"/node-v*/bin; do
    if [ -x "$dir/node" ] && version_ok "$("$dir/node" -v 2>/dev/null)"; then
      node_dir="$dir"
      return
    fi
  done
  # 3. Download one.
  install_private_node
}

# True when nothing is listening on the port (asked of Node.js, so it's the same check the server makes).
port_free() {
  node -e 'const s = require("net").createServer(); s.once("error", () => process.exit(1)); s.listen(Number(process.argv[1]), () => s.close(() => process.exit(0)));' "$1" 2>/dev/null
}

# --- Node.js -------------------------------------------------------------------

node_dir=""
find_node
# npm, and the tools it runs, find this Node.js first.
export PATH="$node_dir:$PATH"
echo "Using Node.js $(node -v) from $node_dir"

# --- Packages ------------------------------------------------------------------

installed=0
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo ""
  echo "Installing packages (first run, or after an update). This takes a few minutes..."
  npm ci --no-audit --no-fund || fail "Installing packages failed. Check the internet connection and try again."
  installed=1
fi

# --- Build ---------------------------------------------------------------------

# Rebuild only when something the build reads is newer than the last build.
need_build=0
if [ "$installed" = 1 ] || [ ! -f .next/BUILD_ID ]; then
  need_build=1
elif [ -n "$(find src public -type f -newer .next/BUILD_ID 2>/dev/null | head -n 1)" ] ||
  [ -n "$(find . -maxdepth 1 -type f \( -name package.json -o -name package-lock.json -o -name 'next.config.*' -o -name tsconfig.json -o -name 'postcss.config.*' -o -name '.env*' \) -newer .next/BUILD_ID | head -n 1)" ]; then
  need_build=1
fi
if [ "$need_build" = 1 ]; then
  echo ""
  echo "Preparing the app. The first time takes a minute or two..."
  npm run build || fail "Preparing the app failed. Read the messages above."
fi

# --- Start ---------------------------------------------------------------------

port=""
for candidate in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
  if port_free "$candidate"; then
    port="$candidate"
    break
  fi
done
[ -n "$port" ] || fail "Ports 3000 to 3010 are all in use. Close other local servers and try again."
url="http://localhost:$port"

echo ""
printf '\033[32m%s\033[0m\n' "The Theorist is starting at $url"
echo "Keep this window open while you use it. Close it (or press Control-C) to stop the app."
echo ""

# Open the browser once the app answers, from the background so the server can start here.
if [ -z "${NO_BROWSER:-}" ]; then
  (
    for _ in $(seq 1 240); do
      if curl -s -o /dev/null --max-time 5 "$url"; then
        open "$url" 2>/dev/null
        break
      fi
      sleep 0.5
    done
  ) &
fi

exec npm start -- -p "$port"
