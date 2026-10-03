#!/usr/bin/env bash
# Copies each Vercel environment variable to the clipboard, one at a time, so secrets never
# need to be shown or pasted anywhere but Vercel → Settings → Environment Variables.
# Reads .env.local (gitignored). macOS only (pbcopy).
set -euo pipefail
cd "$(dirname "$0")/.."
get() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- || true; }

migrate_url="$(get SUPABASE_MIGRATE_URL)"
[ -n "$migrate_url" ] || { echo "SUPABASE_MIGRATE_URL is missing in .env.local"; exit 1; }
# Vercel uses Supabase's transaction pooler: same URL on port 6543.
database_url="${migrate_url/:5432\//:6543/}"

reset_secret="$(get VERCEL_DEMO_RESET_SECRET)"
if [ -z "$reset_secret" ]; then
  reset_secret="$(openssl rand -hex 16)"
  printf '\n# Reset secret used on Vercel (/demo → Reset demo)\nVERCEL_DEMO_RESET_SECRET=%s\n' "$reset_secret" >> .env.local
fi

names=(DATABASE_URL APP_URL PAYMENT_PROVIDER OPENAI_API_KEY OPENAI_MODEL DEMO_RESET_ENABLED DEMO_RESET_SECRET)
values=("$database_url" "https://kirana-shop-ai.vercel.app" "mock" "$(get OPENAI_API_KEY)" "$(get OPENAI_MODEL)" "true" "$reset_secret")
if [ -n "$(get SARVAM_API_KEY)" ]; then names+=(SARVAM_API_KEY); values+=("$(get SARVAM_API_KEY)"); fi

echo "In Vercel: Settings → Environment Variables. For each one below:"
echo "type the Name in Vercel, press Enter here, paste (Cmd+V) into Value, Save."
echo
for i in "${!names[@]}"; do
  read -rp "[$((i + 1))/${#names[@]}] ${names[$i]} — press Enter to copy its value… " _
  printf '%s' "${values[$i]}" | pbcopy
  echo "    copied. Paste it as the value of ${names[$i]}."
done
printf '' | pbcopy
echo
echo "All done (clipboard cleared). The demo reset secret is saved in .env.local as VERCEL_DEMO_RESET_SECRET."
echo "Tell Claude: vercel done"
