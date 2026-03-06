import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosInstance } from "./axios";
import type { Contract, ContractFile, ChatSession, ChatMessage } from "@/types";

// Query Keys
export const queryKeys = {
  contracts: {
    all: ["contracts"] as const,
    lists: () => [...queryKeys.contracts.all, "list"] as const,
    list: (filters?: string) => [...queryKeys.contracts.lists(), { filters }] as const,
    details: () => [...queryKeys.contracts.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.contracts.details(), id] as const,
  },
  chat: {
    all: ["chat"] as const,
    sessions: () => [...queryKeys.chat.all, "sessions"] as const,
    session: (id: string) => [...queryKeys.chat.sessions(), id] as const,
    contractSessions: (contractId: string) => [...queryKeys.chat.sessions(), "contract", contractId] as const,
  },
  health: {
    all: ["health"] as const,
    check: () => [...queryKeys.health.all, "check"] as const,
  },
};

// Contracts Queries
export function useContracts() {
  return useQuery({
    queryKey: queryKeys.contracts.list(),
    queryFn: async () => {
      const { data } = await axiosInstance.get<Contract[]>("/contracts");
      return data;
    },
  });
}

export function useContract(contractId: string) {
  return useQuery({
    queryKey: queryKeys.contracts.detail(contractId),
    queryFn: async () => {
      const { data } = await axiosInstance.get<Contract & { files: ContractFile[] }>(
        `/contracts/${contractId}`
      );
      return data;
    },
    enabled: !!contractId,
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (title: string) => {
      const { data } = await axiosInstance.post<Contract>("/contracts", { title });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contracts.lists() });
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      contractId,
      file,
      versionNumber,
    }: {
      contractId: string;
      file: File;
      versionNumber?: number;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (versionNumber) {
        formData.append("versionNumber", versionNumber.toString());
      }
      
      const { data } = await axiosInstance.post(
        `/contracts/${contractId}/files/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contracts.detail(variables.contractId),
      });
    },
  });
}

// Chat Queries
export function useCreateChatSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ contractId, firstMessage }: { contractId: string; firstMessage?: string }) => {
      const { data } = await axiosInstance.post<ChatSession>("/chat/sessions", {
        contractId,
        firstMessage,
      });
      return data;
    },
    onSuccess: (data) => {
      // Invalidate session detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.session(data.id),
      });
      // Also invalidate the contract sessions list so new session appears in history
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.contractSessions(data.contractId),
      });
    },
  });
}

export function useChatSession(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat.session(sessionId!),
    queryFn: async () => {
      const { data } = await axiosInstance.get<ChatSession & { messages: ChatMessage[] }>(
        `/chat/sessions/${sessionId}`
      );
      return data;
    },
    enabled: !!sessionId,
  });
}

export function useContractSessions(contractId: string) {
  return useQuery({
    queryKey: queryKeys.chat.contractSessions(contractId),
    queryFn: async () => {
      const { data } = await axiosInstance.get<ChatSession[]>(
        `/chat/contracts/${contractId}/sessions`
      );
      return data;
    },
    enabled: !!contractId,
  });
}

export function useUpdateSessionTitle() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      const { data } = await axiosInstance.patch<ChatSession>(`/chat/sessions/${sessionId}`, {
        title,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.session(data.id),
      });
      // Also invalidate the contract sessions list
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.contractSessions(data.contractId),
      });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await axiosInstance.delete(`/chat/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: () => {
      // Invalidate all sessions queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.sessions(),
      });
    },
  });
}

// Health Check Query
export function useBackendHealth() {
  return useQuery({
    queryKey: queryKeys.health.check(),
    queryFn: async () => {
      try {
        await axiosInstance.get("/contracts", {
          signal: AbortSignal.timeout(5000),
        });
        return true;
      } catch {
        return false;
      }
    },
    refetchInterval: 30000, // Check every 30s
    staleTime: 10000, // Consider stale after 10s
  });
}
