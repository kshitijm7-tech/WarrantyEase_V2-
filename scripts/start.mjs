// Production entry point used by `npm start` on the platform.
// NODE_ENV must be set before the server module loads, because it decides
// whether to serve the built SPA or to attach the Vite dev middleware.
process.env.NODE_ENV = 'production';

await import('../dist-server/server.js');
