#!/bin/bash
set -e

# Este proyecto usa pnpm (ver pnpm-lock.yaml). Usar npm aquí rompe la resolución
# de dependencias (intenta reinstalar deps git como closure-net y corrompe el
# tarball). Mantener pnpm para que la instalación sea reproducible y rápida.
pnpm install --frozen-lockfile
pnpm run db:migrate
