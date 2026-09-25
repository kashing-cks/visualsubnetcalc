#!/usr/bin/env sh
# Generate the self-signed certificate that the local HTTPS server serves.
#
# The Playwright suite targets https://localhost:8443 and playwright.config.ts sets
# ignoreHTTPSErrors, so the certificate only has to exist — it does not have to be
# trusted by the system. A plain self-signed certificate is therefore enough, and
# openssl ships with Linux and macOS, so `npm test` works on a clean checkout without
# installing mkcert first.
#
# Idempotent on purpose: an existing unexpired certificate is kept, so running this
# does not clobber a developer's own mkcert-trusted certificate.
#
# Usage: sh scripts/setup-certs.sh [--force] [output-directory]   (default: certs)

set -eu

force=0
if [ "${1:-}" = "--force" ]; then
  force=1
  shift
fi

dir="${1:-certs}"

if [ "$force" -eq 0 ] \
  && [ -f "$dir/cert.pem" ] \
  && [ -f "$dir/cert.key" ] \
  && openssl x509 -checkend 0 -noout -in "$dir/cert.pem" >/dev/null 2>&1; then
  echo "keeping existing $dir/cert.pem and $dir/cert.key"
  exit 0
fi

mkdir -p "$dir"

# A config file rather than `-addext`, because -addext is unavailable on some openssl
# builds that developers still have (notably the LibreSSL that ships with macOS).
conf="$dir/openssl.cnf"
cat > "$conf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no

[dn]
CN = localhost

[v3]
subjectAltName = DNS:localhost, IP:127.0.0.1
basicConstraints = CA:TRUE
EOF

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$dir/cert.key" -out "$dir/cert.pem" -config "$conf" 2>/dev/null

rm -f "$conf"

echo "wrote $dir/cert.pem and $dir/cert.key"
