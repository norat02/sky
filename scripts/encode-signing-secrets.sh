#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/encode-signing-secrets.sh --output-dir DIR [options]

Options:
  --android-keystore FILE   Android upload keystore (.jks or .keystore)
  --ios-p12 FILE            iOS distribution certificate (.p12)
  --appstore-p8 FILE        Optional App Store Connect API private key (.p8)
  --output-dir DIR          Private directory for generated Base64 files
  -h, --help                Show this help

The script never prints secret contents. It performs a decode-and-compare
roundtrip for every generated file and writes files with mode 0600.
USAGE
}

ANDROID_KEYSTORE=''
IOS_P12=''
APPSTORE_P8=''
OUTPUT_DIR=''

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
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

[[ -n "$OUTPUT_DIR" ]] || { echo '--output-dir is required' >&2; exit 2; }
[[ -n "$ANDROID_KEYSTORE" || -n "$IOS_P12" || -n "$APPSTORE_P8" ]] || {
  echo 'Provide at least one input file.' >&2
  exit 2
}

require_file() {
  local label=$1 path=$2
  [[ -f "$path" ]] || { echo "$label does not exist or is not a regular file: $path" >&2; exit 1; }
  [[ ! -L "$path" ]] || { echo "$label must not be a symbolic link: $path" >&2; exit 1; }
}

encode_base64() {
  local input=$1 output=$2
  if base64 --help 2>&1 | grep -q -- '-w'; then
    base64 -w 0 "$input" > "$output"
  else
    base64 "$input" | tr -d '\r\n' > "$output"
  fi
  printf '\n' >> "$output"
}

encode_and_verify() {
  local label=$1 input=$2 output=$3 decoded
  require_file "$label" "$input"
  decoded=$(mktemp "${TMPDIR:-/tmp}/sky-signing-verify.XXXXXX")
  trap 'rm -f "$decoded"' RETURN
  encode_base64 "$input" "$output"
  base64 --decode "$output" > "$decoded"
  cmp -s "$input" "$decoded" || { echo "Roundtrip verification failed for $label" >&2; exit 1; }
  chmod 600 "$output"
  rm -f "$decoded"
  trap - RETURN
  printf 'Created %s (mode 600)\n' "$output"
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
  encode_and_verify 'App Store Connect .p8 key' "$APPSTORE_P8" "$OUTPUT_DIR/APPSTORE_API_PRIVATE_KEY_BASE64.txt"
fi

cat > "$OUTPUT_DIR/README.txt" <<'EOF'
Generated secret preparation files. Do not commit or share them.

Upload the file contents to GitHub Repository Secrets:
- ANDROID_KEYSTORE_BASE64       <- ANDROID_KEYSTORE_BASE64.txt
- IOS_CERTIFICATE_P12_BASE64    <- IOS_CERTIFICATE_P12_BASE64.txt
- APPSTORE_API_PRIVATE_KEY      <- decode APPSTORE_API_PRIVATE_KEY_BASE64.txt first;
                                    GitHub secret expects the original PEM .p8 text.

Passwords and identifiers are intentionally not handled by this script.
Set them manually as GitHub Secrets using the names in docs/release-signing-secrets-vi.md.
EOF
chmod 600 "$OUTPUT_DIR/README.txt"

printf '\nBase64 preparation completed in %s\n' "$OUTPUT_DIR"
printf 'The generated files contain secrets; upload them to GitHub Actions Secrets and remove the local directory when finished.\n'
