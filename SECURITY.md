# Security policy

Security fixes target the current default branch. This application is a self-hosted prototype; operators are responsible for access control, backups, updates, and the treatment of learning content.

Please use GitHub's private vulnerability reporting on this repository when it is available. Do not publish exploit details, credentials, cookies, recovery codes, share URLs, or real user records in public issues. If a private reporting route is unavailable, open an issue containing only a request for a confidential contact route, without vulnerability details.

A useful private report describes the affected version, expected boundary, impact, and minimal reproduction using synthetic data. Do not test against systems or accounts you do not control.

For deployment, use HTTPS and independent production secrets, retain the `/learn/` prefix, and keep the data directory outside publicly served files. The development invitation code `1025` and synthetic mode are refused in production. See [deployment guidance](docs/DEPLOYMENT.md) for configuration and data handling.
