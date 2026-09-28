#!/bin/sh
# Installed by ASDesk provision.sh. certbot runs this after every renewal; it hands the
# renewed certificate for @DOMAIN@ to coturn, which cannot read /etc/letsencrypt itself.
case " $RENEWED_DOMAINS " in *" @DOMAIN@ "*) ;; *) exit 0 ;; esac
install -o turnserver -g turnserver -m 0644 "$RENEWED_LINEAGE/fullchain.pem" /etc/coturn/certs/fullchain.pem
install -o turnserver -g turnserver -m 0600 "$RENEWED_LINEAGE/privkey.pem" /etc/coturn/certs/privkey.pem
systemctl restart coturn
