// Contract Types
export interface Contract {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status?: string | null;
  hasReadyFile?: boolean;
}

export interface ContractFile {
  contractFileId: string;
  contractId: string;
  versionNumber?: number;
  status: 'UPLOADED' | 'EXTRACTED' | 'EMBEDDED' | 'READY' | 'FAILED';
  uploadedAt?: string;
  uploaded_at?: string; // backend có thể trả snake_case
  chunks?: unknown[];
  message?: string;
  url?: string; // Full URL to download/view the PDF file
}

// Chat Types
export interface ChatSession {
  id: string;
  contractId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
  citations?: Citation[];
}

export interface Citation {
  n: number;
  chunkIndex: number;
  distance: number;
  chunkId: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}
