# Deployment Configuration

This folder contains all the deployment-related configuration files for the Zero server.

## Files

- `docker-compose.prod.yml` - Production Docker Compose configuration
- `nginx.conf` - Initial Nginx configuration (HTTP only, for SSL setup)
- `nginx-ssl.conf` - SSL-enabled Nginx configuration (template)

## Usage

The GitHub Actions workflow automatically uses these files when deploying to your VPS.

### Manual deployment

If you need to deploy manually:

```bash
# SSH into your VPS
ssh user@your-vps

# Navigate to deployment directory
cd ~/grnyte/deployment

# Deploy services
docker compose -f docker-compose.prod.yml up -d
```

### SSL Certificate Setup

The deployment process:

1. Starts with `nginx.conf` (HTTP only)
2. Uses Certbot to get SSL certificate
3. Switches to `nginx-ssl.conf` (HTTPS with redirect)

### Environment Variables

Required in `.env.prod`:

- `ZERO_UPSTREAM_DB` - Database connection string
- `ZERO_AUTH_SECRET` - Authentication secret
- `ZERO_PUSH_URL` - Push notification URL
- `ZERO_DOMAIN` - Your domain name for Zero server
- `CERTBOT_EMAIL` - Email for Let's Encrypt
