// ERD-AI-CHAT-MOBILE: fetch con streaming para el Copilot. `expo/fetch` entrega `response.body` como flujo (el fetch global de React Native
// no); se envuelve con el mismo transporte autenticado del resto de la app (renovación de sesión incluida).
import { fetch as expoFetch } from 'expo/fetch';

import { authSession } from '../../auth/runtime';
import { createAuthenticatedFetch } from '../../auth/transport';
import { API_URL, AUTH_ENABLED } from '../../config';
import { streamCopilotTurn, type CopilotEvent, type CopilotTurnInput } from './stream';

const base = expoFetch as unknown as typeof fetch;
const transport = AUTH_ENABLED ? createAuthenticatedFetch(authSession, base) : base;

export const sendCopilotTurn = (homeId: string, conversationId: string, input: CopilotTurnInput, onEvent: (event: CopilotEvent) => void, signal: AbortSignal) =>
  streamCopilotTurn(API_URL, homeId, conversationId, input, onEvent, signal, transport);
