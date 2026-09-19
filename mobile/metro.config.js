// Metro for the Expo Go shell. Two additions to Expo's default:
// 1. watchFolders: the bridge protocol lives in ../src/platform so the page and the shell
//    compile against one file.
// 2. enhanceMiddleware: /app/* is proxied to a local page server (scripts/mobile-tunnel.mjs
//    runs `vite preview` on the /app/ build, or the Vite dev server with --dev). Expo Go
//    already talks to this dev server through the Expo tunnel (https://*.exp.direct, real
//    certificate), so the same URL serves the page over TLS the WebView trusts. WebViews
//    refuse self-signed certificates on both platforms; this is what makes the camera work
//    on a phone with one command. Plain HTTP only: Metro's websocket table is fixed, so the
//    Vite dev server runs without HMR behind the shell (vite.config.ts, MAYDAY_VIA_EXPO).
//    app.config.ts sets web.bundler so Expo's own web index fallback stays out of the way.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');
const path = require('node:path');

const PAGE_PREFIX = '/app';
const PAGE = { host: '127.0.0.1', port: Number(process.env.MAYDAY_PAGE_PORT) || 4173 };

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '..', 'src', 'platform')];

const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const inner = enhanceMiddleware ? enhanceMiddleware(metroMiddleware, server) : metroMiddleware;
  return (req, res, next) => {
    const url = req.url ?? '';
    if (url === PAGE_PREFIX || url.startsWith(`${PAGE_PREFIX}/`) || url.startsWith(`${PAGE_PREFIX}?`)) {
      return proxyToPage(req, res);
    }
    return inner(req, res, next);
  };
};

function proxyToPage(req, res) {
  const upstream = http.request(
    {
      host: PAGE.host,
      port: PAGE.port,
      method: req.method,
      path: req.url,
      // Vite only answers for hosts it knows (DNS rebinding guard); present its own.
      headers: { ...req.headers, host: `${PAGE.host}:${PAGE.port}` },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(
      `The Mayday page server is not answering on port ${PAGE.port} (${err.message}).\n` +
        'Start everything with: npm run mobile:tunnel\n',
    );
  });
  req.pipe(upstream);
}

module.exports = config;
