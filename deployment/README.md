# Zero Infrastructure Deployment

## Quick Start (Simplified)

This deployment has been simplified to be more reliable. The process:

1. **Start services**: All services (Zero servers + nginx) start together
2. **HTTP first**: nginx serves HTTP initially to allow certificate generation
3. **Generate SSL**: Automated script handles SSL certificate generation
4. **Switch to HTTPS**: nginx config is updated to redirect HTTP to HTTPS

### Key Files

- `docker-compose.zero.yml` - Main services (no profiles needed)
- `nginx.zero.conf` - nginx configuration (serves HTTP initially, then HTTPS)
- `setup-ssl.sh` - Automated SSL certificate setup script
- `.env.prod` and `.env.demo` - Environment configurations

### Quick Manual Deployment

If you need to deploy manually:

```bash
# 1. Start all services
docker compose -f docker-compose.zero.yml up -d

# 2. Wait for services to be ready
docker logs zero-server-prod
docker logs zero-server-demo

# 3. Setup SSL certificates
chmod +x setup-ssl.sh
./setup-ssl.sh
```

## Architecture

- **Single VPS deployment** with nginx routing to multiple Zero instances
- **Production instance**: `zero.grnyte.rocks`
- **Demo instance**: `zero.demo.grnyte.rocks`
- **SSL/TLS**: Automatic SSL certificates via Let's Encrypt for both domains
- **Migration-friendly**: Can easily be split to separate servers in the future

## Files

- `docker-compose.zero.yml` - Combined Docker Compose configuration for both Zero instances
- `nginx.zero.conf` - Domain-based nginx configuration with SSL support
- `.env.shared` - Environment variables (auto-generated during deployment)

## Deployment

### Automatic (GitHub Actions)

The deployment is handled automatically by the `deploy-zero.yml` GitHub Actions workflow when changes are pushed to the main branch. The workflow:

1. Creates a `.env.shared` file with all required environment variables
2. Deploys both Zero instances using `docker-compose.zero.yml`
3. Sets up nginx with domain-based routing
4. Obtains SSL certificates for both domains
5. Performs health checks on both instances

### Manual Deployment

If you need to deploy manually:

```bash
# SSH into your VPS
ssh user@your-vps

# Navigate to deployment directory
cd ~/grnyte/deployment

# Create environment file (replace with actual values)
cat > .env.shared << EOF
ZERO_UPSTREAM_DB_PROD=your_production_db_url
ZERO_AUTH_SECRET_PROD=your_production_auth_secret
ZERO_PUSH_URL_PROD=https://zero.grnyte.rocks
ZERO_UPSTREAM_DB_DEMO=your_demo_db_url
ZERO_AUTH_SECRET_DEMO=your_demo_auth_secret
ZERO_PUSH_URL_DEMO=https://zero.demo.grnyte.rocks
EOF

# Clean up any existing deployment
docker compose -f docker-compose.zero.yml down -v --remove-orphans
docker network prune -f

# Deploy both instances
docker compose -f docker-compose.zero.yml up -d

# Check status
docker compose -f docker-compose.zero.yml ps
docker compose -f docker-compose.zero.yml logs
```

## Environment Variables

The deployment requires these environment variables in `.env.shared`:

### Production Instance

- `ZERO_UPSTREAM_DB_PROD` - Production database connection string
- `ZERO_AUTH_SECRET_PROD` - Production authentication secret
- `ZERO_PUSH_URL_PROD` - Production push URL (<https://zero.grnyte.rocks>)

### Demo Instance

- `ZERO_UPSTREAM_DB_DEMO` - Demo database connection string
- `ZERO_AUTH_SECRET_DEMO` - Demo authentication secret
- `ZERO_PUSH_URL_DEMO` - Demo push URL (<https://zero.demo.grnyte.rocks>)

## Migration to Separate Servers

To migrate to separate servers in the future:

1. Split `docker-compose.zero.yml` into separate files:

   - `docker-compose.prod.yml` (production instance + nginx)
   - `docker-compose.demo.yml` (demo instance + nginx)

2. Update nginx configurations to handle single domains each

3. Update GitHub Actions workflow to deploy to different servers

4. Update DNS to point domains to their respective servers

## Monitoring

Check deployment status:

```bash
# View running containers
docker compose -f docker-compose.zero.yml ps

# View logs
docker compose -f docker-compose.zero.yml logs zero-prod
docker compose -f docker-compose.zero.yml logs zero-demo
docker compose -f docker-compose.zero.yml logs nginx

# Test connectivity
curl -f https://zero.grnyte.rocks
curl -f https://zero.demo.grnyte.rocks
```

## Troubleshooting

### Common Issues

1. **Environment variables not loaded**: Ensure `.env.shared` exists and contains all required variables
2. **Network conflicts**: Clean up with `docker network prune -f`
3. **SSL certificate issues**: Check certbot logs with `docker compose logs certbot`
4. **Zero server health checks failing**: Check individual container logs

### Reset Deployment

```bash
# Complete reset (WARNING: This will delete all data)
docker compose -f docker-compose.zero.yml down -v --remove-orphans
docker volume rm deployment_zero_data_prod deployment_zero_data_demo deployment_certbot_conf deployment_certbot_www
docker network prune -f
```
