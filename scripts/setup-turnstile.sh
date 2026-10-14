#!/usr/bin/env bash
#
# A wizard walks a human through a manual procedure, step by step.
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# vercel_put_key KEY VALUE ENV attaches a single env var to the Vercel project
# via the CLI. Used instead of GitHub secrets (deploy is Vercel, not CI).
vercel_put_key() {
  local name="$1" value="$2" env_scope="${3:-production}"
  if command -v vercel >/dev/null 2>&1 && vercel whoami >/dev/null 2>&1; then
    if printf '%s' "$value" | vercel env add "$name" "$env_scope" >/dev/null 2>&1; then
      SKIPPED+=("Add $name to the other Vercel environments (Previews) manually if desired")
      printf '  %s✓ added%s %s → Vercel (%s)\n' "$GREEN" "$RESET" "$name" "$env_scope"
      return
    fi
  fi
  SKIPPED+=("Vercel $name ($env_scope): set it in the dashboard")
  warn "skipped Vercel $name: vercel CLI not ready; set it in the dashboard"
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES: author this section. One stage() per step the human takes.
# Replace the example below. Set TOTAL_STAGES to match the stages you write.
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=3

banner "Cloudflare Turnstile + Vercel"

# ── Stage 1: create the widget in Cloudflare, capture both keys ────────────
stage "Cloudflare: criar o widget Turnstile"
say "Cria um widget no Cloudflare para obter o par Site Key + Secret Key."
note "Widgets recomendado: 'Managed' (mais leve para visitantes humanos)."
open_url "https://dash.cloudflare.com/"
step "Loga na conta Cloudflare → Turnstile → 'Add site'."
step "Nomeie (ex.: 'AgendFined booking'), selecione o modo 'Managed' e os hostnames do domínio."
step "Anote o 'Site Key' (público, começa com 0x) e o 'Secret Key' (privado, server-only)."
ask    NEXT_PUBLIC_TURNSTILE_SITE_KEY "Cole o Site Key (público):"
ask_secret TURNSTILE_SECRET_KEY "Cole o Secret Key (privado):"
write_env NEXT_PUBLIC_TURNSTILE_SITE_KEY "$NEXT_PUBLIC_TURNSTILE_SITE_KEY"
write_env TURNSTILE_SECRET_KEY "$TURNSTILE_SECRET_KEY"
note "Guardadas em $ENV_FILE para dev local. (Não commite esse arquivo.)"

# ── Stage 2: attach the keys to the Vercel project ─────────────────────────
stage "Vercel: adicionar as variáveis de ambiente"
say "As chaves precisam existir no ambiente do servidor Next (Vercel), não só local."
note "O widget (NEXT_PUBLIC_TURNSTILE_SITE_KEY) é exposto ao browser → Production e Preview."
note "O secret (TURNSTILE_SECRET_KEY) é server-only → apenas Production."
open_url "https://vercel.com/DiovannyMartins/agendfined/settings/environment-variables"
step "Em 'Environment Variables' → 'Add New', crie NEXT_PUBLIC_TURNSTILE_SITE_KEY e cole o Site Key."
step "Marque os ambientes: Production + Preview (para o widget carregar em deploy cards)."
step "Crie também TURNSTILE_SECRET_KEY e cole o Secret Key."
step "Marque apenas Production (nunca exponha o secret ao browser)."
if confirm "O CLI vercel está logado? Se sim, tento adicionar as chaves via CLI."; then
  vercel_put_key NEXT_PUBLIC_TURNSTILE_SITE_KEY "$NEXT_PUBLIC_TURNSTILE_SITE_KEY" production
  vercel_put_key TURNSTILE_SECRET_KEY "$TURNSTILE_SECRET_KEY" production
else
  SKIPPED+=("Vercel env vars (via CLI, opcional)")
fi

# ── Stage 3: redeploy to apply ─────────────────────────────────────────────
stage "Vercel: redeploy para aplicar"
say "Mudanças de variáveis de ambiente só valem em NUVOS deployments."
note "Faça push para a branch principal ou rode 'vercel --prod'."
if confirm "Redeployar agora via CLI (vercel --prod)?"; then
  if command -v vercel >/dev/null 2>&1; then
    vercel --prod || warn "deploy falhou; rode 'vercel --prod' manualmente"
  else
    warn "vercel CLI indisponível; rode manualmente"
  fi
fi
note "Depois: npx vercel env pull (popula .env local) e teste com o sitekey de produção."
note "Dica: para testar sem bloqueio, use o sitekey de teste da Cloudflare (1x00000000000000000000AA)."

finish
