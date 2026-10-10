import { createApiClient } from '@energyrd/api-client';
import { API_URL, AUTH_ENABLED } from '../config';
import { authSession } from '../auth/runtime';
import { createAuthenticatedFetch } from '../auth/transport';
import { guardApiErrors } from './errors';
import { createAccountApi } from './account';
import { createHomeApi } from './homes';
export { ApiError, parseErrorBody } from '@energyrd/api-client';
const transport = AUTH_ENABLED ? createAuthenticatedFetch(authSession) : fetch;
// Every domain error is rebuilt from local Spanish text before it can reach a screen.
export const api = guardApiErrors({ ...createApiClient(API_URL, transport), ...createHomeApi(API_URL, transport), ...createAccountApi(API_URL, transport) });
