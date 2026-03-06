import type { Citation } from '@/types';
import { axiosInstance } from './axios';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// SSE Event types
export interface SSEEvent {
  type: 'start' | 'text-start' | 'text-delta' | 'text-end' | 'data' | 'end' | 'error';
  delta?: string;
  citations?: Citation[];
  error?: string;
}

// Streaming message handler
// Note: Streaming must use fetch API, not axios, because axios doesn't support streaming responses
export async function streamMessage(
  sessionId: string,
  message: string,
  contractFileId: string | undefined,
  callbacks: {
    onStart?: () => void;
    onDelta?: (delta: string) => void;
    onEnd?: (citations?: Citation[]) => void;
    onError?: (error: string) => void;
  }
): Promise<void> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4001/api/v1';
  const url = `${API_BASE_URL}/chat/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, message, contractFileId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `HTTP error! status: ${response.status}`,
        response.status,
        errorData
      );
    }

    if (!response.body) {
      throw new ApiError('No response body', response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = line.slice(6); // Remove 'data: ' prefix
            if (data.trim()) {
              const event: SSEEvent = JSON.parse(data);
              
              switch (event.type) {
                case 'start':
                  callbacks.onStart?.();
                  break;
                case 'text-delta':
                  if (event.delta) {
                    callbacks.onDelta?.(event.delta);
                  }
                  break;
                case 'end':
                  callbacks.onEnd?.(event.citations);
                  return;
                case 'error':
                  callbacks.onError?.(event.error || 'Unknown error');
                  return;
              }
            }
          } catch (e) {
            console.error('Error parsing SSE event:', e, line);
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      callbacks.onError?.(error.message);
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
    callbacks.onError?.(errorMessage);
    throw new ApiError(errorMessage, 0);
  }
}

// Health check - use axios with timeout
export async function checkBackendHealth(): Promise<boolean> {
  try {
    await axiosInstance.get('/contracts', {
      timeout: 5000, // 5 second timeout
    });
    return true;
  } catch {
    return false;
  }
}
