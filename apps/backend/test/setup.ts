// Bun's test runner loads .env automatically, but a fresh clone may not have
// one yet. Provide inert defaults so tests that never touch the database can
// still construct the app.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.CORS_ORIGIN ??= "http://127.0.0.1:3000";
process.env.LOG_LEVEL ??= "silent";
// Must satisfy the env schema (min 32 chars) so the app can be constructed
// without a real .env.
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret";
