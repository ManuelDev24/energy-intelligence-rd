import type { Alert } from '../api/types';

export const unreadCount = (alerts: Alert[] | undefined) => (alerts ?? []).filter((a) => a.status === 'unread').length;
