# Environment Configuration Guide

This guide explains how to manage environment variables and credentials for the Trading Backtester application.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Initial Setup](#initial-setup)
- [Managing Credentials](#managing-credentials)
- [Updating Variables](#updating-variables)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

All sensitive configuration (API keys, passwords, Telegram tokens) is stored in a **protected `.env` file** located **outside the git repository**. This ensures:

✅ **Security**: Credentials are never committed to git
✅ **Persistence**: `.env` file is NOT overwritten during deployments
✅ **Simplicity**: Single file for all configuration
✅ **Compatibility**: Fallback to `settings.json` for backward compatibility

---

## Architecture

### File Locations

```
Production Server:
~/stonks-config/          # Configuration directory (outside repo)
  └── .env                # Protected environment file (chmod 600)

~/stonks/                 # Git repository (deployed code)
  ├── server/.env.example # Template file (in git)
  ├── docker-compose.yml  # References ~/stonks-config/.env
  └── deploy.sh           # Deployment script (checks .env exists)
```

### How It Works

1. **Docker Compose** mounts `~/stonks-config/.env` into the container
2. **Server.js** reads variables from environment (with fallback to `settings.json`)
3. **Deploy script** verifies `.env` exists before starting containers
4. **Git** ignores `~/stonks-config/` directory completely

---

## Initial Setup

### Step 1: Connect to Server

```bash
ssh ubuntu@146.235.212.239
```

### Step 2: Create Configuration Directory

```bash
# Create directory with restricted permissions
mkdir -p ~/stonks-config
chmod 700 ~/stonks-config
```

### Step 3: Copy Template

```bash
# Copy the example file as a starting point
cp ~/stonks/server/.env.example ~/stonks-config/.env
```

### Step 4: Edit Configuration

```bash
# Open the file in nano editor
nano ~/stonks-config/.env
```

**Fill in the following REQUIRED variables:**

```bash
# Authentication (REQUIRED)
ADMIN_USERNAME=your_email@example.com
ADMIN_PASSWORD=your_bcrypt_hash_here

# Telegram (REQUIRED for monitoring)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# API Keys (at least ONE is REQUIRED)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
FINNHUB_API_KEY=your_finnhub_key
TWELVE_DATA_API_KEY=your_twelve_data_key
POLYGON_API_KEY=your_polygon_key
```

**Nano editor shortcuts:**
- Save: `Ctrl + O`, then `Enter`
- Exit: `Ctrl + X`

### Step 5: Secure the File

```bash
# Set strict permissions (owner read/write only)
chmod 600 ~/stonks-config/.env

# Verify permissions
ls -la ~/stonks-config/.env
# Should show: -rw------- (600)
```

### Step 6: Generate Password Hash

**Option A: Use the API endpoint**

```bash
# Start the server temporarily
cd ~/stonks
docker compose up -d

# Generate hash
curl -X POST https://tradingibs.site/api/auth/hash-password \
  -H "Content-Type: application/json" \
  -d '{"password": "your_secure_password"}'

# Copy the hash from the response and paste into .env
```

**Option B: Use Node.js directly**

```bash
# On the server
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your_password', 10).then(console.log)"
```

### Step 7: Restart Application

```bash
cd ~/stonks

# IMPORTANT: Use 'up -d' to recreate containers and load new .env
# Do NOT use 'restart' - it won't reload env_file!
docker compose up -d
```

**Why not `restart`?**
Docker Compose reads `env_file` only when **creating** a container, not when restarting it. Always use `up -d` after .env changes.

### Step 8: Verify Configuration

```bash
# Check container logs for errors
docker compose logs server --tail=50

# Test API status
curl https://tradingibs.site/api/status

# Verify .env was loaded
docker compose exec server env | grep ADMIN_USERNAME
```

---

## Managing Credentials

### Where Are Credentials Stored?

| Variable | Primary Source | Fallback Source |
|----------|----------------|-----------------|
| API Keys | `~/stonks-config/.env` | `settings.json` (via UI) |
| Telegram | `~/stonks-config/.env` | `settings.json` (via UI) |
| Admin Password | `~/stonks-config/.env` | **None** (must be in .env) |
| Admin Username | `~/stonks-config/.env` | **None** (must be in .env) |

### Fallback Behavior

The server loads variables in this priority order:

1. **Environment variables** (from `.env` file) — **HIGHEST PRIORITY**
2. **settings.json** (managed via web UI) — **FALLBACK**
3. **Default values** (from code) — **LAST RESORT**

**Example:**
```javascript
// server.js line 71-78
const API_CONFIG = {
  ALPHA_VANTAGE_API_KEY:
    settings.api?.alphaVantageKey ||      // Try settings.json first
    process.env.ALPHA_VANTAGE_API_KEY ||  // Then environment variable
    '',                                    // Default to empty string
  // ...
};
```

**Note:** Authentication variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) have **no fallback** and must always be in `.env`.

---

## Updating Variables

### Method 1: Direct Edit (Recommended)

```bash
# SSH into server
ssh ubuntu@146.235.212.239

# Edit the file
nano ~/stonks-config/.env

# Make your changes (e.g., update API key)
# Save: Ctrl+O, Enter, Ctrl+X

# CRITICAL: Recreate container to load new .env (NOT restart!)
cd ~/stonks
docker compose up -d

# Verify
docker compose logs server --tail=20
```

### Method 2: Replace Entire File

```bash
# On your local machine, create new .env file
nano /tmp/new.env  # Fill in all variables

# Copy to server (overwrites existing)
scp /tmp/new.env ubuntu@146.235.212.239:~/stonks-config/.env

# SSH and recreate container (NOT restart!)
ssh ubuntu@146.235.212.239 "cd ~/stonks && docker compose up -d"

# Clean up local copy
rm /tmp/new.env
```

### Method 3: One-Line Variable Update

```bash
# Update a single variable via SSH
ssh ubuntu@146.235.212.239 "
  sed -i 's/^ALPHA_VANTAGE_API_KEY=.*/ALPHA_VANTAGE_API_KEY=NEW_KEY_VALUE/' ~/stonks-config/.env &&
  cd ~/stonks &&
  docker compose up -d
"
```

---

## Security Best Practices

### ✅ DO

- **Store `.env` outside git repository** (`~/stonks-config/`)
- **Use bcrypt hashes for passwords** (never plain text in production)
- **Set file permissions to 600** (`chmod 600 ~/stonks-config/.env`)
- **Backup `.env` before making changes** (`cp ~/.env ~/.env.backup`)
- **Use strong, unique passwords** (20+ characters)
- **Rotate API keys regularly** (every 6-12 months)
- **Limit SSH access** (use SSH keys, disable password auth)

### ❌ DON'T

- **Never commit `.env` to git** (already in `.gitignore`)
- **Never share `.env` file contents** (contains secrets)
- **Never use weak passwords** (e.g., "admin123")
- **Never store `.env` in home directory root** (use `~/stonks-config/`)
- **Never use world-readable permissions** (avoid 644, 755)
- **Never hardcode secrets in code** (always use environment variables)

### Password Security

**Generate strong passwords:**

```bash
# On Linux/macOS (generate 32-character random password)
openssl rand -base64 32

# Example output:
# 8fJ2kL9pQ3mN6vR4wX7tY1zB5cD0eA
```

**Generate bcrypt hash:**

```bash
# Using the API (after server is running)
curl -X POST https://tradingibs.site/api/auth/hash-password \
  -H "Content-Type: application/json" \
  -d '{"password": "8fJ2kL9pQ3mN6vR4wX7tY1zB5cD0eA"}'

# Response:
# {"hash": "$2b$10$abcd...xyz"}
```

### File Permissions Reference

```bash
# Directory permissions (only owner can access)
chmod 700 ~/stonks-config/
# Breakdown: 7 (rwx) for owner, 0 (---) for group, 0 (---) for others

# File permissions (only owner can read/write)
chmod 600 ~/stonks-config/.env
# Breakdown: 6 (rw-) for owner, 0 (---) for group, 0 (---) for others

# Verify
ls -la ~/stonks-config/
# Should show:
# drwx------ (directory: 700)
# -rw------- (file: 600)
```

---

## Troubleshooting

### Problem: Deployment fails with ".env not found"

**Error message:**
```
❌ КРИТИЧЕСКАЯ ОШИБКА: ~/stonks-config/.env не найден!
```

**Solution:**
```bash
ssh ubuntu@146.235.212.239

# Check if file exists
ls -la ~/stonks-config/.env

# If missing, create it from template
mkdir -p ~/stonks-config
cp ~/stonks/server/.env.example ~/stonks-config/.env
nano ~/stonks-config/.env  # Fill in real values
chmod 600 ~/stonks-config/.env
```

---

### Problem: Login fails with "Invalid credentials"

**Possible causes:**
1. `ADMIN_PASSWORD` is not set in `.env`
2. Password hash is incorrect
3. Username doesn't match

**Solution:**
```bash
ssh ubuntu@146.235.212.239

# Check if variables are loaded
docker compose exec server env | grep ADMIN

# If empty, check .env file
cat ~/stonks-config/.env | grep ADMIN

# Regenerate password hash
curl -X POST https://tradingibs.site/api/auth/hash-password \
  -H "Content-Type: application/json" \
  -d '{"password": "your_password"}'

# Update .env with new hash
nano ~/stonks-config/.env

# Recreate container to load new .env
cd ~/stonks && docker compose up -d
```

---

### Problem: API calls fail (no data fetched)

**Possible causes:**
1. API keys not set or invalid
2. Rate limits exceeded
3. API provider service down

**Solution:**
```bash
ssh ubuntu@146.235.212.239

# Check if API keys are loaded
docker compose exec server env | grep API_KEY

# Test a specific API
curl "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&apikey=YOUR_KEY"

# Check server logs for API errors
docker compose logs server --tail=100 | grep -i error

# Verify API key in .env
nano ~/stonks-config/.env
# Make sure key is not empty and has no extra spaces

# Recreate container to load changes
cd ~/stonks && docker compose up -d
```

---

### Problem: Telegram notifications not working

**Possible causes:**
1. `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` incorrect
2. Bot not started (user must send `/start` to bot first)
3. Bot not added to group (if using group chat)

**Solution:**
```bash
# Verify Telegram config is loaded
docker compose exec server env | grep TELEGRAM

# Test bot manually
TOKEN="your_bot_token"
CHAT_ID="your_chat_id"

curl -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=Test message"

# If this fails, the token/chat_id are wrong
# Get correct chat_id:
curl "https://api.telegram.org/bot${TOKEN}/getUpdates"

# Update .env
nano ~/stonks-config/.env

# Recreate container to load changes
cd ~/stonks && docker compose up -d

# Test via app
curl -X POST https://tradingibs.site/api/telegram/test
```

---

### Problem: Changes to .env not taking effect

**This is THE most common issue!**

**Root cause:** Docker Compose only reads `env_file` when **creating** a container, NOT when restarting.

**Solution:**
```bash
# CORRECT: Recreate container to load new .env
cd ~/stonks
docker compose up -d

# WRONG: This will NOT reload .env!
# docker compose restart server

# Alternative: Full recreate with cleanup
docker compose down
docker compose up -d

# Verify variables inside container
docker compose exec server env | grep -E "ADMIN|TELEGRAM|API_KEY"
```

**Why does this happen?**
- `docker compose restart` only restarts the process inside existing container
- The container's environment is set at creation time
- To load new .env values, you must recreate the container with `up -d`

---

### Problem: .env file gets overwritten during deployment

**This should NOT happen with the new setup.**

**If it does, verify:**
```bash
# Check docker-compose.yml points to correct location
cat ~/stonks/docker-compose.yml | grep env_file
# Should show: - ~/stonks-config/.env

# Check deploy.sh has the validation
cat ~/stonks/deploy.sh | grep -A3 "stonks-config"
# Should show the .env existence check

# If deployment still overwrites, check permissions
ls -la ~/stonks-config/.env
# Should be: -rw------- (600)
```

---

## Backup and Recovery

### Backup .env File

```bash
# Create timestamped backup
ssh ubuntu@146.235.212.239 "
  cp ~/stonks-config/.env ~/stonks-config/.env.backup-\$(date +%Y%m%d-%H%M%S)
"

# Download backup to local machine
scp ubuntu@146.235.212.239:~/stonks-config/.env ~/backup/.env.production-$(date +%Y%m%d)
```

### Restore from Backup

```bash
# On server
ssh ubuntu@146.235.212.239

# List available backups
ls -la ~/stonks-config/.env.backup-*

# Restore from backup
cp ~/stonks-config/.env.backup-20231204-153000 ~/stonks-config/.env

# Recreate container
cd ~/stonks && docker compose up -d
```

---

## API Key Providers

### Alpha Vantage (Recommended)

- **Free tier:** 5 requests/minute, 500 requests/day
- **Sign up:** https://www.alphavantage.co/support/#api-key
- **Best for:** Daily OHLC data, historical data
- **Rate limit handling:** Built-in 15s delay in app

### Finnhub

- **Free tier:** 60 requests/minute
- **Sign up:** https://finnhub.io/register
- **Best for:** Real-time quotes, company info
- **Rate limit handling:** Very generous, rarely an issue

### Twelve Data

- **Free tier:** 8 requests/minute, 800 requests/day
- **Sign up:** https://twelvedata.com/pricing
- **Best for:** Balanced usage, good for monitoring 4-5 tickers
- **Rate limit handling:** Built-in 15s delay in app

### Polygon.io

- **Free tier:** 5 requests/minute
- **Sign up:** https://polygon.io/pricing
- **Best for:** Stock splits data, aggregates
- **Rate limit handling:** Built-in 15s delay in app

---

## Quick Reference

### Common Commands

```bash
# View current .env
ssh ubuntu@146.235.212.239 "cat ~/stonks-config/.env"

# Edit .env
ssh ubuntu@146.235.212.239 "nano ~/stonks-config/.env"

# Recreate container to load changes (NOT restart!)
ssh ubuntu@146.235.212.239 "cd ~/stonks && docker compose up -d"

# Check if variables are loaded
ssh ubuntu@146.235.212.239 "docker compose exec server env | grep -E 'ADMIN|TELEGRAM|API'"

# View server logs
ssh ubuntu@146.235.212.239 "docker compose logs server --tail=50"

# Check container status
ssh ubuntu@146.235.212.239 "docker compose ps"
```

### File Locations Reference

| File | Location | Purpose | In Git? |
|------|----------|---------|---------|
| **Production .env** | `~/stonks-config/.env` | Real secrets | ❌ No |
| **Template** | `~/stonks/server/.env.example` | Documentation | ✅ Yes |
| **Docker Compose** | `~/stonks/docker-compose.yml` | References .env | ✅ Yes |
| **Settings JSON** | `/data/state/settings.json` | Fallback config | ❌ No |
| **Deploy Script** | `~/stonks/deploy.sh` | Validates .env | ✅ Yes |

---

## Need Help?

If you encounter issues not covered in this guide:

1. **Check server logs:** `docker compose logs server --tail=100`
2. **Check container status:** `docker compose ps`
3. **Verify .env is loaded:** `docker compose exec server env`
4. **Review server.js:** Lines 1-80 show how variables are loaded
5. **Test API endpoints:** Use `curl` to test individual endpoints

For questions or issues, contact the development team or file an issue in the repository.
