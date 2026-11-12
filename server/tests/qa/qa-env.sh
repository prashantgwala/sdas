# Test-only environment. Never point DB_NAME at the production database.
# MONGODB_URI is inherited from server/.env; DB_NAME isolates the QA database.
export NODE_ENV=test
export PORT=5001
export DB_NAME=sdas_qa_20261112_1
export APP_URL=http://localhost:3200
export CORS_ORIGIN=http://localhost:3200
export COOKIE_SECURE=false
export JWT_ACCESS_SECRET=qa_only_access_secret_8f3c1d9b7a6e5f4c2b1a0d9e8f7c6b5a
export JWT_REFRESH_SECRET=qa_only_refresh_secret_2e4f6a8c0b1d3f5a7c9e1b3d5f7a9c2e
export ENCRYPTION_KEY=qa_only_encryption_key_9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a
export SEED_ADMIN_NAME="QA Super Admin"
export SEED_ADMIN_EMAIL=qa.admin@sdas.test
export SEED_ADMIN_PASSWORD='QaAdmin@12345'
export SEED_ADMIN_MOBILE=9000000001
export RESTRICTED_MODULE_ENABLED=false
export CRON_ENABLED=false
# Keep external integrations inert during QA.
export SMTP_HOST=''
export SMTP_USER=''
export SMTP_PASS=''
export SMTP_FROM=''
export SMS_PROVIDER=''
export SMS_API_KEY=''
export OPENAI_API_KEY=''
export UPLOAD_DIR=./uploads/qa
export QA_API_BASE=http://localhost:5001
