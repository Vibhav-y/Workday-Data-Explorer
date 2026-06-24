const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// All Workday configuration comes from environment variables (see .env.example).
const TENANT = process.env.WORKDAY_TENANT;
const BASE_URL = process.env.WORKDAY_BASE_URL;
const CLIENT_ID = process.env.WORKDAY_CLIENT_ID;
const CLIENT_SECRET = process.env.WORKDAY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.WORKDAY_REFRESH_TOKEN;

// Fail fast with a clear message if any required variable is missing.
const REQUIRED_ENV = {
  WORKDAY_TENANT: TENANT,
  WORKDAY_BASE_URL: BASE_URL,
  WORKDAY_CLIENT_ID: CLIENT_ID,
  WORKDAY_CLIENT_SECRET: CLIENT_SECRET,
  WORKDAY_REFRESH_TOKEN: REFRESH_TOKEN,
};
const missingEnv = Object.entries(REQUIRED_ENV)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

const WQL_ROOT = `${BASE_URL}/api/wql/v1/${TENANT}`;
const TOKEN_URL = `${BASE_URL}/ccx/oauth2/${TENANT}/token`;

let accessToken = null;
let tokenExpiry = 0;

function toPublicError(error) {
  const status = error.response?.status || 500;
  const details = error.response?.data || error.message;
  return {
    status,
    body: {
      error: 'Workday request failed',
      details,
    },
  };
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  accessToken = response.data.access_token;
  const expiresIn = Number(response.data.expires_in || 3600);
  tokenExpiry = Date.now() + Math.max(expiresIn - 60, 60) * 1000;
  return accessToken;
}

async function workdayGet(path, params = {}) {
  const token = await getAccessToken();
  const response = await axios.get(`${WQL_ROOT}${path}`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    timeout: 30000,
  });
  return response.data;
}

function validateWql(query) {
  const value = String(query || '').trim();
  if (!value) {
    return 'Query is required';
  }
  if (!/^select\s+/i.test(value)) {
    return 'Only SELECT WQL queries are allowed';
  }
  if (/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(value)) {
    return 'Only read-only WQL queries are allowed';
  }
  return null;
}

app.get('/api/health', async (_req, res) => {
  try {
    await getAccessToken();
    res.json({
      ok: true,
      tenant: TENANT,
      auth: 'oauth_refresh_token',
      wqlRoot: WQL_ROOT,
    });
  } catch (error) {
    const { status, body } = toPublicError(error);
    res.status(status).json({ ...body, ok: false });
  }
});

app.get('/api/data-sources', async (_req, res) => {
  try {
    const PAGE = 100;
    const first = await workdayGet('/dataSources', { limit: PAGE, offset: 0 });
    const total = first.total ?? (first.data || []).length;
    let all = [...(first.data || [])];

    const remaining = Math.ceil((total - all.length) / PAGE);
    const pages = Array.from({ length: remaining }, (_, i) =>
      workdayGet('/dataSources', { limit: PAGE, offset: (i + 1) * PAGE }),
    );
    const rest = await Promise.all(pages);
    rest.forEach((p) => { all = all.concat(p.data || []); });

    res.json({ total, data: all });
  } catch (error) {
    const { status, body } = toPublicError(error);
    res.status(status).json(body);
  }
});

app.get('/api/data-sources/:id/fields', async (req, res) => {
  try {
    const data = await workdayGet(`/dataSources/${encodeURIComponent(req.params.id)}/fields`);
    res.json(data);
  } catch (error) {
    const { status, body } = toPublicError(error);
    res.status(status).json(body);
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    const validationError = validateWql(query);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const data = await workdayGet('/data', { query: query.trim() });
    res.json({
      ...data,
      query: query.trim(),
      source: 'workday_wql',
    });
  } catch (error) {
    const { status, body } = toPublicError(error);
    res.status(status).json(body);
  }
});

const server = app.listen(PORT, () => {
  console.log(`Backend proxy running on http://localhost:${PORT}`);
  console.log(`Using Workday WQL root: ${WQL_ROOT}`);
});

server.on('error', (error) => {
  console.error('Backend failed to start:', error.message);
  process.exit(1);
});
