#!/usr/bin/env bash
# One-off setup for a fresh Ubuntu 24.04 VM. Run with sudo.
set -euo pipefail

# 1 GiB of RAM leaves no headroom for Postgres, Node and an image pull at
# once, so give it 2 GiB of swap to fall back on.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker
usermod -aG docker "${SUDO_USER:-$USER}"

echo "Done. Log out and back in so docker works without sudo."
