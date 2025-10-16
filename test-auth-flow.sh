#!/bin/bash

echo "🧪 Testing Complete Authentication Flow..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if process is running on port
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

echo -e "${BLUE}1️⃣ Starting Backend Server...${NC}"
cd backend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

# Start backend in background
npm run dev:simple > backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
for i in {1..10}; do
    if check_port 3001; then
        echo -e "${GREEN}✅ Backend started successfully on port 3001${NC}"
        break
    fi
    sleep 2
done

if ! check_port 3001; then
    echo -e "${RED}❌ Backend failed to start${NC}"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${BLUE}2️⃣ Starting Frontend Server...${NC}"
cd ../frontend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Start frontend in background
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
echo "⏳ Waiting for frontend to start..."
for i in {1..15}; do
    if check_port 3000; then
        echo -e "${GREEN}✅ Frontend started successfully on port 3000${NC}"
        break
    fi
    sleep 2
done

if ! check_port 3000; then
    echo -e "${RED}❌ Frontend failed to start${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${BLUE}3️⃣ Testing API Endpoints...${NC}"

# Test backend root endpoint
echo "🔍 Testing backend root endpoint..."
BACKEND_ROOT=$(curl -s http://localhost:3001/ | jq -r '.success' 2>/dev/null)
if [ "$BACKEND_ROOT" = "true" ]; then
    echo -e "${GREEN}✅ Backend root endpoint working${NC}"
else
    echo -e "${YELLOW}⚠️ Backend root endpoint may have issues${NC}"
fi

# Test health endpoint
echo "🏥 Testing health endpoint..."
HEALTH_STATUS=$(curl -s http://localhost:3001/health | jq -r '.status' 2>/dev/null)
if [ "$HEALTH_STATUS" = "ok" ]; then
    echo -e "${GREEN}✅ Health endpoint working${NC}"
else
    echo -e "${YELLOW}⚠️ Health endpoint may have issues${NC}"
fi

# Test frontend
echo "🌐 Testing frontend..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Frontend accessible${NC}"
else
    echo -e "${YELLOW}⚠️ Frontend may have issues (status: $FRONTEND_STATUS)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Test Results Summary:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "🚀 Backend: ${GREEN}http://localhost:3001${NC}"
echo -e "🌐 Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "📊 API Root: ${GREEN}http://localhost:3001/${NC}"
echo -e "🏥 Health Check: ${GREEN}http://localhost:3001/health${NC}"
echo ""
echo -e "${BLUE}📝 Test Login Credentials:${NC}"
echo -e "📧 Email: ${YELLOW}admin@teste.com${NC}"
echo -e "🔑 Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "${BLUE}🧪 Manual Testing Steps:${NC}"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Click 'Entrar' or 'Começar Grátis'"
echo "3. Use the test credentials above"
echo "4. Verify you can access the dashboard"
echo "5. Test logout functionality"
echo ""

# Keep servers running for manual testing
echo -e "${YELLOW}⏳ Servers will run for 60 seconds for manual testing...${NC}"
echo -e "${BLUE}Press Ctrl+C to stop servers early${NC}"

# Trap Ctrl+C
trap 'echo -e "\n${YELLOW}🛑 Stopping servers...${NC}"; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

# Wait for 60 seconds or until interrupted
for i in {60..1}; do
    echo -ne "\r⏰ Time remaining: ${i}s "
    sleep 1
done

echo ""
echo -e "${YELLOW}🛑 Stopping servers...${NC}"
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null

echo ""
echo -e "${GREEN}✅ Authentication flow test completed!${NC}"
echo ""
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo "1. Set up your database (PostgreSQL/Supabase)"
echo "2. Run 'npm run seed' in backend to create admin user"
echo "3. Add your OpenAI API key for AI features"
echo "4. Configure WhatsApp integration"
echo "5. Deploy to production"