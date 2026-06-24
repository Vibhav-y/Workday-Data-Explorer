import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
});

function unwrapError(error) {
  return error.response?.data || { error: error.message || 'Request failed' };
}

export async function getHealth() {
  try {
    const response = await client.get('/health');
    return response.data;
  } catch (error) {
    throw unwrapError(error);
  }
}

export async function getDataSources() {
  try {
    const response = await client.get('/data-sources');
    return response.data;
  } catch (error) {
    throw unwrapError(error);
  }
}

export async function getDataSourceFields(sourceId) {
  try {
    const response = await client.get(`/data-sources/${encodeURIComponent(sourceId)}/fields`);
    return response.data;
  } catch (error) {
    throw unwrapError(error);
  }
}

export async function executeWqlQuery(query) {
  try {
    const response = await client.post('/query', { query });
    return response.data;
  } catch (error) {
    throw unwrapError(error);
  }
}
