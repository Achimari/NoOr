#!/bin/sh
set -e

APP_DIR="${APP_DIR:-/opt/noor}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
START_APP="${START_APP:-false}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
MIN_BUILD_MEMORY_MB="${MIN_BUILD_MEMORY_MB:-2048}"

if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

install_packages() {
  $SUDO apt-get update
  $SUDO apt-get install -y ca-certificates curl git gnupg util-linux
}

ensure_build_memory() {
  if [ "${DISABLE_SWAP:-false}" = "true" ] || [ ! -r /proc/meminfo ]; then
    return
  fi

  memory_kb="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
  swap_kb="$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)"
  minimum_kb="$((MIN_BUILD_MEMORY_MB * 1024))"

  if [ "$((memory_kb + swap_kb))" -ge "$minimum_kb" ]; then
    echo "Build memory is sufficient; no swap file is needed."
    return
  fi

  swap_file="/swapfile-noor"
  if awk -v path="$swap_file" '$1 == path { found = 1 } END { exit !found }' /proc/swaps; then
    echo "$swap_file is already active."
    return
  fi

  echo "Creating a ${SWAP_SIZE_MB} MB swap file for the Docker build..."
  if [ ! -f "$swap_file" ]; then
    if ! $SUDO fallocate -l "${SWAP_SIZE_MB}M" "$swap_file"; then
      $SUDO dd if=/dev/zero of="$swap_file" bs=1M count="$SWAP_SIZE_MB" status=progress
    fi
  fi

  $SUDO chmod 600 "$swap_file"
  $SUDO mkswap "$swap_file"
  $SUDO swapon "$swap_file"

  if ! $SUDO grep -qF "$swap_file none swap sw 0 0" /etc/fstab; then
    echo "$swap_file none swap sw 0 0" | $SUDO tee -a /etc/fstab >/dev/null
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker and Compose plugin are already installed."
    return
  fi

  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable docker
  $SUDO systemctl start docker
}

prepare_repo() {
  if [ -z "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
    echo "Set REPO_URL to your git repository URL, for example:"
    echo "REPO_URL=https://github.com/your-name/your-repo.git sh scripts/digitalocean-install.sh"
    exit 1
  fi

  if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull --ff-only origin "$BRANCH"
    return
  fi

  $SUDO mkdir -p "$(dirname "$APP_DIR")"
  $SUDO chown "$(id -u):$(id -g)" "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
}

prepare_env() {
  cd "$APP_DIR"

  if [ ! -f .env ]; then
    cp .env.production.example .env
    echo "Created .env from .env.production.example."
    echo "Edit $APP_DIR/.env and replace every change-me value before starting."
  fi

  if grep -q "change-me" .env; then
    echo ".env still contains change-me placeholders."
    echo "Edit $APP_DIR/.env, then run:"
    echo "sh scripts/docker-prod-start.sh"
    exit 1
  fi
}

start_app() {
  cd "$APP_DIR"
  docker compose down --remove-orphans
  COMPOSE_PARALLEL_LIMIT=1 docker compose --progress plain build app
  docker compose up -d --no-build
  docker compose ps
}

install_packages
ensure_build_memory
install_docker
prepare_repo
prepare_env

if [ "$START_APP" = "true" ]; then
  start_app
else
  echo "Server dependencies are ready."
  echo "After editing $APP_DIR/.env, start with:"
  echo "cd $APP_DIR && sh scripts/docker-prod-start.sh"
fi
