import createClient from 'openapi-fetch';
import type { paths } from './schema';

export const api = createClient<paths>({
  baseUrl: import.meta.env.DEV ? 'http://127.0.0.1:8000' : '',
});
