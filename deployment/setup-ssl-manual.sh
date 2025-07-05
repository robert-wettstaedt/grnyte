#!/bin/bash
# Optional manual SSL setup - run this ONCE after initial deployment

echo "🔐 Manual SSL Setup for Production"
echo "This sets up SSL certificates and HTTPS redirect"
echo "Run this ONCE after your initial deployment is working"
echo ""

read -p "Have you verified that http://zero.grnyte.rocks and http://zero.demo.grnyte.rocks work? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "Please test HTTP first, then run this script"
    exit 1
fi

echo "Setting up SSL..."

# Install certbot on the host (if not already installed)
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt update
    sudo apt install -y certbot
fi

# Stop nginx temporarily
echo "Stopping nginx temporarily..."
docker stop nginx-main

# Get certificates using standalone mode
echo "Getting SSL certificates..."
sudo certbot certonly \
    --standalone \
    --email info@grnyte.rocks \
    --agree-tos \
    --no-eff-email \
    -d zero.grnyte.rocks \
    -d zero.demo.grnyte.rocks

if [ $? -eq 0 ]; then
    echo "✅ SSL certificates obtained"

    # Create nginx config with SSL
    cat > nginx-ssl.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    resolver 127.0.0.11 valid=30s;
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name zero.grnyte.rocks zero.demo.grnyte.rocks;
        return 301 https://$host$request_uri;
    }

    # HTTPS for production
    server {
        listen 443 ssl http2;
        server_name zero.grnyte.rocks;

        ssl_certificate /etc/letsencrypt/live/zero.grnyte.rocks/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/zero.grnyte.rocks/privkey.pem;

        location / {
            proxy_pass http://zero-server-prod:4848;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

    # HTTPS for demo
    server {
        listen 443 ssl http2;
        server_name zero.demo.grnyte.rocks;

        ssl_certificate /etc/letsencrypt/live/zero.demo.grnyte.rocks/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/zero.demo.grnyte.rocks/privkey.pem;

        location / {
            proxy_pass http://zero-server-demo:4848;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
EOF

    # Update docker-compose to use SSL config and mount certificates
    echo "Updating Docker Compose for SSL..."
    # You'd manually update docker-compose to mount the SSL config and certificates

    echo "✅ SSL setup complete!"
    echo "Next steps:"
    echo "1. Update docker-compose.simple.yml to mount nginx-ssl.conf and /etc/letsencrypt"
    echo "2. Restart containers: docker compose -f docker-compose.simple.yml up -d"
    echo "3. Set up certbot auto-renewal: sudo crontab -e"
    echo "   Add: 0 12 * * * /usr/bin/certbot renew --quiet && docker restart nginx-main"

else
    echo "❌ SSL certificate generation failed"
    # Restart nginx in HTTP mode
    docker start nginx-main
fi
