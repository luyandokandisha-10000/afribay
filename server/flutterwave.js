import 'dotenv/config';

const FLUTTERWAVE_OAUTH_URL = process.env.FLUTTERWAVE_OAUTH_URL || 'https://api.flutterwave.com/v4/oauth/token';
const FLUTTERWAVE_BASE_URL = process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v4';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Fetches or returns a valid cached OAuth 2.0 Access Token from Flutterwave v4
 */
export async function getFlutterwaveOAuthToken() {
  const clientId = process.env.FLUTTERWAVE_CLIENT_ID;
  const clientSecret = process.env.FLUTTERWAVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FLUTTERWAVE_CLIENT_ID and FLUTTERWAVE_CLIENT_SECRET must be set in environment variables');
  }

  // Return cached token if still valid (with 60-second buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  console.log('[Flutterwave v4] Requesting new OAuth access token...');

  const response = await fetch(FLUTTERWAVE_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error('[Flutterwave v4 OAuth Error]:', data);
    throw new Error(data.message || data.error_description || 'Failed to authenticate with Flutterwave OAuth');
  }

  cachedToken = data.access_token;
  // expires_in is typically in seconds (default to 3600s if omitted)
  const expiresInMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = Date.now() + expiresInMs;

  console.log('[Flutterwave v4] OAuth token acquired successfully.');
  return cachedToken;
}

/**
 * Helper to make authenticated requests to Flutterwave v4 APIs
 */
export async function flutterwaveRequest(endpoint, options = {}) {
  const token = await getFlutterwaveOAuthToken();

  const url = endpoint.startsWith('http') ? endpoint : `${FLUTTERWAVE_BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const result = await response.json();
  return { status: response.status, ok: response.ok, data: result };
}
