#!/bin/sh
set -e

APP_DIR="${APP_DIR:-/opt/noor}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
START_APP="${START_APP:-false}"

if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

install_packages() {
  $SUDO apt-get update
  $SUDO apt-get install -y ca-certificates curl git gnupg
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
    echo "npm run docker:prod:start"
    exit 1
  fi
}

start_app() {
  cd "$APP_DIR"
  docker compose up -d --build
  docker compose ps
}

install_packages
install_docker
prepare_repo
prepare_env

if [ "$START_APP" = "true" ]; then
  start_app
else
  echo "Server dependencies are ready."
  echo "After editing $APP_DIR/.env, start with:"
  echo "cd $APP_DIR && npm run docker:prod:start"
fi
