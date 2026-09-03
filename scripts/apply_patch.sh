#!/bin/bash
# Copy all auth patch files into the project
# Run from project root: bash scripts/apply_patch.sh

set -e

SRC="dhara-patch"  # adjust if your patch folder has a different name

echo "Applying Dhara auth patch..."

# Required: docker-compose.yml fix
cp "$SRC/docker-compose.yml"        docker-compose.yml
echo "✓ docker-compose.yml"

# Required: setup script fix  
cp "$SRC/scripts/setup.py"          scripts/setup.py
echo "✓ scripts/setup.py"

# Auth library
mkdir -p frontend/lib
cp "$SRC/frontend/lib/supabase.js"  frontend/lib/supabase.js
echo "✓ frontend/lib/supabase.js"

# Auth components
mkdir -p frontend/components/auth
cp "$SRC/frontend/components/auth/AuthContext.js" frontend/components/auth/AuthContext.js
cp "$SRC/frontend/components/auth/AuthUI.js"      frontend/components/auth/AuthUI.js
cp "$SRC/frontend/components/auth/UserMenu.js"    frontend/components/auth/UserMenu.js
echo "✓ frontend/components/auth/"

# Updated layout + header
cp "$SRC/frontend/app/layout.js"                  frontend/app/layout.js
cp "$SRC/frontend/components/layout/Header.js"    frontend/components/layout/Header.js
echo "✓ layout + header"

# New pages
mkdir -p frontend/app/login frontend/app/signup frontend/app/auth/callback
cp "$SRC/frontend/app/login/page.js"              frontend/app/login/page.js
cp "$SRC/frontend/app/signup/page.js"             frontend/app/signup/page.js
cp "$SRC/frontend/app/auth/callback/page.js"      frontend/app/auth/callback/page.js
echo "✓ login / signup / callback pages"

# package.json (adds @supabase/supabase-js)
cp "$SRC/frontend/package.json"                   frontend/package.json
echo "✓ frontend/package.json"

# .env.example  
cp "$SRC/.env.example"                            .env.example
echo "✓ .env.example"

echo ""
echo "✅ Patch applied. Next steps:"
echo "  1. cd frontend && npm install"
echo "  2. Add Supabase keys to .env (see .env.example)"
echo "  3. python3 scripts/setup.py"
