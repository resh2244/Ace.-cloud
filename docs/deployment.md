# Deployment Checklist — Simone Cloud

1. **Environment Variables**: Configure production secret keys, database paths, and domain names.
2. **Reverse Proxy & TLS**: Deploy behind Nginx or Caddy with strict TLS 1.3 termination and HSTS enabled.
3. **Firewall Rules**: Restrict access to host management interfaces; permit only outbound HTTPS from node agents.
4. **Database Backups**: Schedule automated nightly snapshots of `/data/simone.json` or SQLite database files.
