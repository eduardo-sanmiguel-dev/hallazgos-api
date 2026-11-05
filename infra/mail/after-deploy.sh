#!/usr/bin/env bash
# Installed at ~/comportarte-messaging/after-deploy.sh; invoked by the existing deploy.
set -Eeuo pipefail
cd "$HOME/hallazgos-api"
if [ ! -f dist/mail-worker.js ]; then exit 0; fi
export NODE_ENV=production
if [ "$(docker inspect comportarte-mail-redis --format '{{.State.Health.Status}}')" != 'healthy' ]; then
  echo 'Mail Redis is not healthy; worker activation aborted' >&2
  exit 1
fi
started_at=$(date +%s)
pm2 startOrReload ecosystem.config.js --only mail-worker --update-env
ready=false
for attempt in $(seq 1 20); do
  if node dist/mail-admin.js health "$started_at" >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then
  echo 'Mail worker did not report a fresh heartbeat; inspect pm2 logs mail-worker' >&2
  exit 1
fi
pm2 save
python3 "$HOME/comportarte-messaging/provision-observe.py" --activate
node dist/mail-admin.js report
echo 'Mail worker verified, saved for reboot and monitoring activated'
