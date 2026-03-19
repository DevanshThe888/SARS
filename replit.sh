#!/bin/bash
# Replit automated deployment script

echo "Building frontend..."
cd frontend
npm install
npm run build

echo "Setting up backend and starting..."
cd ../backend
npm install
npm run start:replit
