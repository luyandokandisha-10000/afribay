import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Simple native .env loader without third-party dependencies
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      });
    }
  }
}

loadEnv();

const PORT = process.env.PORT || 5000;
const CLIENT_ID = process.env.FLUTTERWAVE_CLIENT_ID || '7f21e663-d2ee-4286-b96e-83c671b2fcd1';
const CLIENT_SECRET = process.env.FLUTTERWAVE_CLIENT_SECRET || 'RO1K7hNqNvQOq3Qjy6OnlFGAvM7BkfmE';
const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY || '7OYFHKab7WEyROpKYVBlpxm5g/LtzUBH+k4ouAGLAsM=';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Fetches OAuth 2.0 token using Node's native fetch API
 */
export async function getFlutterwaveOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return { success: true, token: cachedToken, cached: true };
  }

  const tokenUrl = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

  console.log(`[Flutterwave v4] Requesting OAuth token from Flutterwave IdP...`);

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const body = await res.json();

    if (!res.ok || !body.access_token) {
      return {
        success: false,
        status: res.status,
        error: body.message || body.error_description || 'OAuth token request rejected',
        details: body
      };
    }

    cachedToken = body.access_token;
    const expiresIn = (body.expires_in || 3600) * 1000;
    tokenExpiresAt = Date.now() + expiresIn;

    return {
      success: true,
      token: cachedToken,
      expiresIn: body.expires_in
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// Native HTTP Server with CORS
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint: Health & Diagnostic
  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const tokenResult = await getFlutterwaveOAuthToken();

    res.writeHead(tokenResult.success ? 200 : 502);
    res.end(JSON.stringify({
      service: 'AfriBay Zambian Payment Gateway',
      environment: 'Sandbox / Test Mode',
      clientId: `${CLIENT_ID.substring(0, 10)}...`,
      encryptionKeyConfigured: Boolean(ENCRYPTION_KEY),
      oauthResult: tokenResult
    }, null, 2));
    return;
  }

  // Endpoint: Direct OAuth Token Check
  if (url.pathname === '/api/auth/token') {
    res.setHeader('Content-Type', 'application/json');
    const result = await getFlutterwaveOAuthToken();
    res.writeHead(result.success ? 200 : 400);
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // Endpoint: Initiate Checkout
  if (url.pathname === '/api/checkout/initiate' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const tokenResult = await getFlutterwaveOAuthToken();

        if (!tokenResult.success) {
          res.writeHead(502);
          res.end(JSON.stringify({
            success: false,
            message: 'Failed to acquire Flutterwave OAuth token for checkout',
            oauthError: tokenResult
          }));
          return;
        }

        const txRef = payload.txRef || `AFB-${Date.now().toString(36).toUpperCase()}`;

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'OAuth token verified. Checkout initiated.',
          txRef,
          amountZMW: payload.amount,
          tokenUsed: `${tokenResult.token.substring(0, 10)}...`
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` AfriBay Flutterwave OAuth Server active on port ${PORT}`);
  console.log(` Diagnostics: http://localhost:${PORT}/api/health`);
  console.log(`======================================================\n`);
});
