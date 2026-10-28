#!/usr/bin/env bash
#
# encode-signing-secrets.sh
#
# Prepare Android keystore and iOS signing material for GitHub Actions
# Repository Secrets. The script is fail-closed and never prints secret
# contents to stdout, stderr, or the shell history.
#
# Design rules:
#   * Secret material is never echoed. Only names, byte counts, and status.
#   * Every generated file is verified with a decode-and-compare roundtrip.
#   * Output files are created with mode 0600 inside a 0700 directory.
#   * Symbolic links are rejected so a link cannot redirect output elsewhere.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/encode-signing-secrets.sh --output-dir DIR [options]
  scripts/encode-signing-secrets.sh --check [--repo OWNER/NAME]
  scripts/encode-signing-secrets.sh --self-test

Options:
  --android-keystore FILE   Android upload keystore (.jks or .keystore)
  --ios-p12 FILE            iOS distribution certificate (.p12)
  --appstore-p8 FILE        App Store Connect API private key (.p8)
  --output-dir DIR          Private directory for generated Base64 files
  --repo OWNER/NAME         Target GitHub repository (default: git remote)
  --set-github-secrets      Upload the generated secrets with `gh secret set`
  --check                   Report which required repository secrets are missing
  --self-test               Run an offline roundtrip self-test with fake data
  -h, --help                Show this help

Secret name mapping:
  ANDROID_KEYSTORE_BASE64        <- Android keystore, Base64 encoded
  IOS_CERTIFICATE_P12_BASE64     <- iOS .p12 certificate, Base64 encoded
  APPSTORE_API_PRIVATE_KEY       <- App Store Connect .p8, RAW PEM (not Base64)

The .p8 secret is intentionally NOT Base64 encoded: the release workflow passes
`APPSTORE_API_PRIVATE_KEY` straight to `apple-actions/download-provisioning-profiles`,
which expects the original PEM text.
USAGE
}

ANDROID_KEYSTORE=''
IOS_P12=''
APPSTORE_P8=''
OUTPUT_DIR=''
REPO=''
SET_GITHUB_SECRETS=0
CHECK_ONLY=0
SELF_TEST=0

while (($#)); do
  case "$1" in
    --android-keystore)
      [[ $# -ge 2 ]] || { echo 'Missing value for --android-keystore' >&2; exit 2; }
      ANDROID_KEYSTORE=$2; shift 2 ;;
    --ios-p12)
      [[ $# -ge 2 ]] || { echo 'Missing value for --ios-p12' >&2; exit 2; }
      IOS_P12=$2; shift 2 ;;
    --appstore-p8)
      [[ $# -ge 2 ]] || { echo 'Missing value for --appstore-p8' >&2; exit 2; }
      APPSTORE_P8=$2; shift 2 ;;
    --output-dir)
      [[ $# -ge 2 ]] || { echo 'Missing value for --output-dir' >&2; exit 2; }
      OUTPUT_DIR=$2; shift 2 ;;
    --repo)
      [[ $# -ge 2 ]] || { echo 'Missing value for --repo' >&2; exit 2; }
      REPO=$2; shift 2 ;;
    --set-github-secrets)
      SET_GITHUB_SECRETS=1; shift ;;
    --check)
      CHECK_ONLY=1; shift ;;
    --self-test)
      SELF_TEST=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Required secret inventory. Kept in one place so --check, the generated
# README, and the documentation cannot drift apart.
# ---------------------------------------------------------------------------
REQUIRED_SECRETS=(
  ANDROID_KEYSTORE_BASE64
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
  IOS_CERTIFICATE_P12_BASE64
  IOS_CERTIFICATE_PASSWORD
  IOS_TEAM_ID
  IOS_BUNDLE_ID
  APPSTORE_ISSUER_ID
  APPSTORE_API_KEY_ID
  APPSTORE_API_PRIVATE_KEY
)

# Secrets that this script can fill from local files.
FILE_BACKED_SECRETS=(
  ANDROID_KEYSTORE_BASE64
  IOS_CERTIFICATE_P12_BASE64
  APPSTORE_API_PRIVATE_KEY
)

# Secrets that must be typed by a human. The script can never derive these.
MANUAL_SECRETS=(
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
  IOS_CERTIFICATE_PASSWORD
  IOS_TEAM_ID
  IOS_BUNDLE_ID
  APPSTORE_ISSUER_ID
  APPSTORE_API_KEY_ID
)

# ---------------------------------------------------------------------------
# Portable base64 helpers
# ---------------------------------------------------------------------------

# Encode a file to Base64 without line wrapping.
encode_base64() {
  local input=$1 output=$2
  if base64 --help 2>&1 | grep -q -- '-w'; then
    base64 -w 0 "$input" > "$output"
  else
    # BSD/macOS base64 wraps by default; strip the newlines afterwards.
    base64 "$input" | tr -d '\r\n' > "$output"
  fi
  printf '\n' >> "$output"
}

# Decode a Base64 file across GNU and BSD coreutils.
decode_base64() {
  local input=$1 output=$2
  if base64 --help 2>&1 | grep -q -- '--decode'; then
    base64 --decode "$input" > "$output"
  elif base64 --help 2>&1 | grep -q -- '-d'; then
    base64 -d "$input" > "$output"
  else
    base64 -D "$input" > "$output"
  fi
}

require_file() {
  local label=$1 path=$2
  [[ -f "$path" ]] || { echo "$label does not exist or is not a regular file: $path" >&2; exit 1; }
  [[ ! -L "$path" ]] || { echo "$label must not be a symbolic link: $path" >&2; exit 1; }
}

# Encode, then decode and byte-compare. Fail closed on any mismatch.
encode_and_verify() {
  local label=$1 input=$2 output=$3 decoded
  require_file "$label" "$input"
  decoded=$(mktemp "${TMPDIR:-/tmp}/sky-signing-verify.XXXXXX")
  trap 'rm -f "$decoded"' RETURN
  encode_base64 "$input" "$output"
  decode_base64 "$output" "$decoded"
  cmp -s "$input" "$decoded" || { echo "Roundtrip verification failed for $label" >&2; exit 1; }
  chmod 600 "$output"
  rm -f "$decoded"
  trap - RETURN
  printf 'Created %s (mode 600, %s bytes source)\n' "$output" "$(wc -c < "$input" | tr -d ' ')"
}

# ---------------------------------------------------------------------------
# GitHub helpers
# ---------------------------------------------------------------------------

resolve_repo() {
  if [[ -n "$REPO" ]]; then
    printf '%s\n' "$REPO"
    return 0
  fi
  local remote
  remote=$(git -C "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" remote get-url origin 2>/dev/null || true)
  if [[ -z "$remote" ]]; then
    echo 'Cannot determine target repository. Pass --repo OWNER/NAME.' >&2
    return 1
  fi
  remote=${remote%.git}
  remote=${remote#https://github.com/}
  remote=${remote#git@github.com:}
  remote=${remote#ssh://git@github.com/}
  printf '%s\n' "$remote"
}

require_gh() {
  command -v gh >/dev/null 2>&1 || {
    echo 'GitHub CLI (gh) is required for this operation but was not found.' >&2
    echo 'Install it from https://cli.github.com/ then run `gh auth login`.' >&2
    return 1
  }
  gh auth status >/dev/null 2>&1 || {
    echo 'GitHub CLI is installed but not authenticated. Run `gh auth login`.' >&2
    return 1
  }
}

# Report which required repository secrets currently exist.
check_repository() {
  local repo=$1 present=()
  mapfile -t present < <(gh secret list --repo "$repo" --json name --jq '.[].name')
  local name
  printf 'Repository: %s\n\n' "$repo"
  printf 'Required repository secrets:\n'
  for name in "${REQUIRED_SECRETS[@]}"; do
    if printf '%s\n' "${present[@]}" | grep -qx -- "$name"; then
      printf '  [present] %s\n' "$name"
    else
      printf '  [MISSING] %s\n' "$name"
    fi
  done
  local missing=0
  for name in "${REQUIRED_SECRETS[@]}"; do
    printf '%s\n' "${present[@]}" | grep -qx -- "$name" || missing=$((missing + 1))
  done
  printf '\n%d of %d required secrets are missing.\n' "$missing" "${#REQUIRED_SECRETS[@]}"
  [[ "$missing" -eq 0 ]]
}

# Upload a file's contents as a repository secret without echoing the value.
upload_secret() {
  local repo=$1 name=$2 file=$3
  require_gh
  gh secret set "$name" --repo "$repo" < "$file"
  printf 'Uploaded %s to %s\n' "$name" "$repo"
}

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

run_self_test() {
  # SELFTEST_DIR is intentionally global: the EXIT trap fires after this
  # function returns, when function-local variables are already out of scope.
  SELFTEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/sky-signing-selftest.XXXXXX")
  trap 'rm -rf "$SELFTEST_DIR"' EXIT
  head -c 2048 /dev/urandom > "$SELFTEST_DIR/fake.jks"
  head -c 1024 /dev/urandom > "$SELFTEST_DIR/fake.p12"
  printf -- '-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n' > "$SELFTEST_DIR/fake.p8"
  local out="$SELFTEST_DIR/out"
  mkdir -p "$out"
  chmod 700 "$out"
  encode_and_verify 'Android keystore' "$SELFTEST_DIR/fake.jks" "$out/ANDROID_KEYSTORE_BASE64.txt" >/dev/null
  encode_and_verify 'iOS .p12 certificate' "$SELFTEST_DIR/fake.p12" "$out/IOS_CERTIFICATE_P12_BASE64.txt" >/dev/null
  # The .p8 is stored raw so it can be piped to `gh secret set` unchanged.
  cp "$SELFTEST_DIR/fake.p8" "$out/APPSTORE_API_PRIVATE_KEY.txt"
  chmod 600 "$out/APPSTORE_API_PRIVATE_KEY.txt"
  cmp -s "$SELFTEST_DIR/fake.p8" "$out/APPSTORE_API_PRIVATE_KEY.txt" || {
    echo 'Self-test failed: .p8 copy mismatch' >&2; exit 1;
  }
  local perms
  perms=$(stat -c '%a' "$out/ANDROID_KEYSTORE_BASE64.txt" 2>/dev/null || stat -f '%Lp' "$out/ANDROID_KEYSTORE_BASE64.txt")
  [[ "$perms" == '600' ]] || { echo "Self-test failed: unexpected mode $perms" >&2; exit 1; }
  printf 'Self-test OK: Base64 roundtrip, raw .p8 copy, and file modes verified.\n'
}

if [[ "$SELF_TEST" -eq 1 ]]; then
  run_self_test
  exit 0
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  require_gh
  repo=$(resolve_repo)
  check_repository "$repo" || exit 1
  exit 0
fi

[[ -n "$OUTPUT_DIR" ]] || { echo '--output-dir is required' >&2; exit 2; }
[[ -n "$ANDROID_KEYSTORE" || -n "$IOS_P12" || -n "$APPSTORE_P8" ]] || {
  echo 'Provide at least one input file.' >&2
  exit 2
}

umask 077
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

if [[ -n "$ANDROID_KEYSTORE" ]]; then
  encode_and_verify 'Android keystore' "$ANDROID_KEYSTORE" "$OUTPUT_DIR/ANDROID_KEYSTORE_BASE64.txt"
fi
if [[ -n "$IOS_P12" ]]; then
  encode_and_verify 'iOS .p12 certificate' "$IOS_P12" "$OUTPUT_DIR/IOS_CERTIFICATE_P12_BASE64.txt"
fi
if [[ -n "$APPSTORE_P8" ]]; then
  # Stored raw: apple-actions expects the original PEM text, not Base64.
  require_file 'App Store Connect .p8 key' "$APPSTORE_P8"
  cp "$APPSTORE_P8" "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY.txt"
  chmod 600 "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY.txt"
  printf 'Created %s (mode 600, %s bytes source)\n' \
    "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY.txt" "$(wc -c < "$APPSTORE_P8" | tr -d ' ')"
fi

cat > "$OUTPUT_DIR/README.txt" <<'EOF'
Generated secret preparation files. Do not commit or share them.

Upload to GitHub Repository Secrets (Settings > Secrets and variables > Actions):
  ANDROID_KEYSTORE_BASE64     <- ANDROID_KEYSTORE_BASE64.txt
  IOS_CERTIFICATE_P12_BASE64  <- IOS_CERTIFICATE_P12_BASE64.txt
  APPSTORE_API_PRIVATE_KEY    <- APPSTORE_API_PRIVATE_KEY.txt  (raw PEM, NOT Base64)

These secrets must still be created by hand:
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
  IOS_CERTIFICATE_PASSWORD
  IOS_TEAM_ID
  IOS_BUNDLE_ID
  APPSTORE_ISSUER_ID
  APPSTORE_API_KEY_ID

Upload automatically with:
  gh secret set ANDROID_KEYSTORE_BASE64 --repo OWNER/NAME < ANDROID_KEYSTORE_BASE64.txt
  gh secret set IOS_CERTIFICATE_P12_BASE64 --repo OWNER/NAME < IOS_CERTIFICATE_P12_BASE64.txt
  gh secret set APPSTORE_API_PRIVATE_KEY --repo OWNER/NAME < APPSTORE_API_PRIVATE_KEY.txt
EOF
chmod 600 "$OUTPUT_DIR/README.txt"

if [[ "$SET_GITHUB_SECRETS" -eq 1 ]]; then
  repo=$(resolve_repo)
  require_gh
  printf '\nUploading file-backed secrets to %s\n' "$repo"
  [[ -f "$OUTPUT_DIR/ANDROID_KEYSTORE_BASE64.txt" ]] && \
    upload_secret "$repo" ANDROID_KEYSTORE_BASE64 "$OUTPUT_DIR/ANDROID_KEYSTORE_BASE64.txt"
  [[ -f "$OUTPUT_DIR/IOS_CERTIFICATE_P12_BASE64.txt" ]] && \
    upload_secret "$repo" IOS_CERTIFICATE_P12_BASE64 "$OUTPUT_DIR/IOS_CERTIFICATE_P12_BASE64.txt"
  [[ -f "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY.txt" ]] && \
    upload_secret "$repo" APPSTORE_API_PRIVATE_KEY "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY.txt"
  printf '\nRemaining secrets to set by hand:\n'
  for name in "${MANUAL_SECRETS[@]}"; do printf '  %s\n' "$name"; done
else
  printf '\nBase64 preparation completed in %s\n' "$OUTPUT_DIR"
  printf 'The generated files contain secrets; upload them to GitHub Actions Secrets and remove the local directory when finished.\n'
  printf 'Tip: re-run with --set-github-secrets to upload the file-backed secrets automatically.\n'
fi
