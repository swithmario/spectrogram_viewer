#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Starting Audio Analysis Tool...${NC}"

# Check for .venv
if [ ! -d ".venv" ]; then
    echo -e "${RED}Error: .venv directory not found. Please create a virtual environment first.${NC}"
    exit 1
fi

# Check for frontend node_modules
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
fi

# Function to kill processes on exit
cleanup() {
    echo -e "\n${BLUE}Shutting down services...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

# Start Backend
echo -e "${GREEN}Starting Backend (FastAPI)...${NC}"
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start Frontend
echo -e "${GREEN}Starting Frontend (Next.js)...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait
