#!/bin/bash
set -a
source .env.local
set +a

cd apps/api
npm run dev
