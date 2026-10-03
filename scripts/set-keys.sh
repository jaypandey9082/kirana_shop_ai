#!/usr/bin/env bash
# Asks for the AI keys and writes them into .env.local (gitignored).
# Typing is hidden; leave a prompt empty to keep the current value.
# Usage: set-keys.sh [ai|paytm|sarvam]   (default: ai)
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env.local

set_var() {
  local name="$1" value="$2"
  NAME="$name" VALUE="$value" python3 - <<'PY'
import os, re
name, value = os.environ["NAME"], os.environ["VALUE"].strip().strip('"').strip("'")
path = ".env.local"
lines = open(path).read().splitlines()
pat = re.compile(rf"^{re.escape(name)}=")
out, done = [], False
for line in lines:
    if pat.match(line):
        if not done:
            out.append(f"{name}={value}")
            done = True
        continue
    out.append(line)
if not done:
    out.append(f"{name}={value}")
open(path, "w").write("\n".join(out) + "\n")
PY
}

ask() {
  local name="$1" prompt="$2" hidden="$3" value
  if [ "$hidden" = 1 ]; then read -rsp "$prompt: " value; echo; else read -rp "$prompt: " value; fi
  if [ -n "$value" ]; then set_var "$name" "$value"; echo "  ✓ $name saved"; else echo "  · $name unchanged"; fi
}

echo "Paste each value and press Enter (keys are hidden while you type)."
case "${1:-ai}" in
  paytm)
    ask PAYTM_MID "Paytm STAGING MID" 0
    ask PAYTM_MERCHANT_KEY "Paytm STAGING Test Key" 1
    set_var PAYTM_WEBSITE WEBSTAGING
    ;;
  sarvam)
    ask SARVAM_API_KEY "Sarvam API key" 1
    ;;
  *)
    ask OPENAI_API_KEY "OpenAI API key" 1
    ask OPENAI_MODEL "OpenAI model name (vision-capable, e.g. from your OpenAI dashboard)" 0
    ask SARVAM_API_KEY "Sarvam API key" 1
    ;;
esac
echo "Done. Tell Claude: keys added"
