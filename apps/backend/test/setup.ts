// Bun's test runner loads .env automatically, but a fresh clone may not have
// one yet. Provide inert defaults so tests that never touch the database can
// still construct the app.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "silent";
