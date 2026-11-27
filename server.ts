import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { handleImportPlanHttp, MAX_IMPORT_REQUEST_BYTES } from './api/_lib/importAuth';
import { handleExtractMindHttp } from './api/_lib/mindExtract';

const app = express();
app.disable('x-powered-by');

const SECURITY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://lh3.googleusercontent.com https://www.gstatic.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseappcheck.googleapis.com https://www.google.com https://www.recaptcha.net wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://www.recaptcha.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Content-Security-Policy', SECURITY_CSP);
  }
  next();
});

app.get('/api/health', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ ok: true });
});

app.post(
  '/api/import-plan',
  (request, response, next) => {
    express.json({ limit: MAX_IMPORT_REQUEST_BYTES })(request, response, err => {
      if (err) {
        response.setHeader('Cache-Control', 'no-store');
        const status = (err as { status?: number; type?: string }).type === 'entity.too.large' ? 413 : 400;
        response.status(status).json({
          error:
            status === 413
              ? `Request payload too large. Maximum size is ${Math.round(MAX_IMPORT_REQUEST_BYTES / 1024)}KB.`
              : 'Malformed JSON request body.',
        });
        return;
      }
      next();
    });
  },
  async (request, response) => {
    const rawBytesHeader = Number(request.headers['content-length'] ?? 0);
    const result = await handleImportPlanHttp({
      method: request.method,
      authorizationHeader: request.headers.authorization,
      body: request.body,
      rawBodyBytes: Number.isFinite(rawBytesHeader) && rawBytesHeader > 0 ? rawBytesHeader : undefined,
    });

    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.status(result.status).json(result.body);
  },
);

app.post(
  '/api/extract-mind',
  (request, response, next) => {
    express.json({ limit: MAX_IMPORT_REQUEST_BYTES })(request, response, err => {
      if (err) {
        response.setHeader('Cache-Control', 'no-store');
        const status = (err as { status?: number; type?: string }).type === 'entity.too.large' ? 413 : 400;
        response.status(status).json({
          error:
            status === 413
              ? `Request payload too large. Maximum size is ${Math.round(MAX_IMPORT_REQUEST_BYTES / 1024)}KB.`
              : 'Malformed JSON request body.',
        });
        return;
      }
      next();
    });
  },
  async (request, response) => {
    const rawBytesHeader = Number(request.headers['content-length'] ?? 0);
    const result = await handleExtractMindHttp({
      method: request.method,
      authorizationHeader: request.headers.authorization,
      body: request.body,
      rawBodyBytes: Number.isFinite(rawBytesHeader) && rawBytesHeader > 0 ? rawBytesHeader : undefined,
    });

    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.status(result.status).json(result.body);
  },
);

app.all('/api/*', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.status(404).json({ error: 'API endpoint not found.' });
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

if (process.env.NODE_ENV === 'production') {
  const dist = resolve(process.cwd(), 'dist');
  const assets = resolve(dist, 'assets');

  app.use(
    '/assets',
    express.static(assets, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );

  app.use(
    express.static(dist, {
      index: false,
      setHeaders: res => {
        res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.get('*', (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(resolve(dist, 'index.html'));
  });

  const server = app.listen(port, host, () => console.log(`InPursuit listening on http://${host}:${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  const httpServer = createHttpServer(app);
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      ws: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  httpServer.listen(port, host, () => console.log(`InPursuit dev server listening on http://${host}:${port}`));
}