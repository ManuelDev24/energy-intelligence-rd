"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { keys } from "@/lib/api/hooks";
import type { CopilotConversation } from "@/lib/api/types";

// ERD-AI-CHAT: claves bajo la vivienda (invalidar la vivienda también refresca el Copilot).
export const copilotKeys = {
  root: (homeId: string) => [...keys.home(homeId), "copilot"] as const,
  usage: (homeId: string) => [...keys.home(homeId), "copilot", "usage"] as const,
  conversations: (homeId: string) => [...keys.home(homeId), "copilot", "conversations"] as const,
  messages: (homeId: string, conversationId: string) => [...keys.home(homeId), "copilot", "messages", conversationId] as const,
};

const on = (...ids: Array<string | null | undefined>) => ids.every(id => !!id);

export const useCopilotUsage = (homeId: string) =>
  useQuery({ queryKey: copilotKeys.usage(homeId), queryFn: ({ signal }) => getApi().getCopilotUsage(homeId, signal), enabled: on(homeId) });

export const useConversations = (homeId: string) =>
  useQuery({ queryKey: copilotKeys.conversations(homeId), queryFn: ({ signal }) => getApi().listCopilotConversations(homeId, signal), enabled: on(homeId) });

export const useConversationMessages = (homeId: string, conversationId: string | null) =>
  useQuery({
    queryKey: copilotKeys.messages(homeId, conversationId ?? "none"),
    queryFn: ({ signal }) => getApi().listCopilotMessages(homeId, conversationId!, signal),
    enabled: on(homeId, conversationId),
  });

export function useConversationMutations(homeId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: copilotKeys.conversations(homeId) });
  return {
    create: useMutation({
      mutationFn: (title?: string) => getApi().createCopilotConversation(homeId, title),
      // Se añade a la caché antes de seleccionarla: así la lista nunca «pierde» la conversación recién creada mientras se refresca.
      onSuccess: created => {
        qc.setQueryData<CopilotConversation[]>(copilotKeys.conversations(homeId), old => [created, ...(old ?? []).filter(c => c.id !== created.id)]);
        return refresh();
      },
    }),
    rename: useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => getApi().renameCopilotConversation(homeId, id, title), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => getApi().deleteCopilotConversation(homeId, id), onSuccess: refresh }),
    feedback: useMutation({
      mutationFn: ({ conversationId, messageId, value }: { conversationId: string; messageId: string; value: 1 | -1 | null }) =>
        getApi().setCopilotFeedback(homeId, conversationId, messageId, value),
      onSuccess: updated => qc.invalidateQueries({ queryKey: copilotKeys.messages(homeId, updated.conversation_id) }),
    }),
  };
}
