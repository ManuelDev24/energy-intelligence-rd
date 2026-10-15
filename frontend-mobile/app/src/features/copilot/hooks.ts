import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationOut } from '@energyrd/api-contracts';

import { api } from '../../api/client';
import { copilotKeys, retryPolicy } from '../../api/hooks';
import { AUTH_ENABLED } from '../../config';
import { authSession } from '../../auth/runtime';

const allowed = () => !AUTH_ENABLED || authSession.getSnapshot().status === 'authenticated';
const on = (...ids: Array<string | null | undefined>) => allowed() && ids.every((id) => !!id);

export const useCopilotUsage = (homeId: string | null) =>
  useQuery({ queryKey: copilotKeys.usage(homeId ?? 'none'), queryFn: ({ signal }) => api.getCopilotUsage(homeId as string, signal), enabled: on(homeId), retry: retryPolicy });

export const useConversations = (homeId: string | null) =>
  useQuery({ queryKey: copilotKeys.conversations(homeId ?? 'none'), queryFn: ({ signal }) => api.listCopilotConversations(homeId as string, signal), enabled: on(homeId), retry: retryPolicy });

export const useConversationMessages = (homeId: string | null, conversationId: string | null) =>
  useQuery({
    queryKey: copilotKeys.messages(homeId ?? 'none', conversationId ?? 'none'),
    queryFn: ({ signal }) => api.listCopilotMessages(homeId as string, conversationId as string, signal),
    enabled: on(homeId, conversationId), retry: retryPolicy,
  });

export function useConversationMutations(homeId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: copilotKeys.conversations(homeId) });
  return {
    create: useMutation({
      mutationFn: (title?: string) => api.createCopilotConversation(homeId, title),
      onSuccess: (created) => {
        qc.setQueryData<ConversationOut[]>(copilotKeys.conversations(homeId), (old) => [created, ...(old ?? []).filter((c) => c.id !== created.id)]);
        return refresh();
      },
    }),
    rename: useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => api.renameCopilotConversation(homeId, id, title), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteCopilotConversation(homeId, id), onSuccess: refresh }),
    feedback: useMutation({
      mutationFn: ({ conversationId, messageId, value }: { conversationId: string; messageId: string; value: 1 | -1 | null }) =>
        api.setCopilotFeedback(homeId, conversationId, messageId, value),
      onSuccess: (updated) => qc.invalidateQueries({ queryKey: copilotKeys.messages(homeId, updated.conversation_id) }),
    }),
  };
}
