"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { X, Send, Copy, Loader2, History, MessageSquare, Pencil, Trash2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatSession, useCreateChatSession, useContractSessions, useUpdateSessionTitle, useDeleteSession } from "@/lib/queries";
import { streamMessage } from "@/lib/api";
import { ChatMessage, ChatResponse, Citation } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

interface ChatPanelProps {
  contractId: string;
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  setSessionId: (id: string) => void;
}

export function ChatPanel({ contractId, isOpen, onClose, sessionId: sessionIdProp, setSessionId }: ChatPanelProps) {
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<(ChatMessage | (ChatResponse & { id?: string }))[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const effectiveSessionId = sessionIdProp ?? localSessionId;
  
  const { data: session, isLoading: loading } = useChatSession(effectiveSessionId);
  const { data: sessions = [], isLoading: sessionsLoading } = useContractSessions(contractId);
  const createSession = useCreateChatSession();
  const updateSessionTitle = useUpdateSessionTitle();
  const deleteSession = useDeleteSession();

  // Update messages when session data changes
  useEffect(() => {
    if (session?.messages) {
      setMessages(session.messages);
    }
  }, [session?.messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();

    // Lazy session creation: create session on first message
    if (!effectiveSessionId && !createSession.isPending) {
      createSession.mutate(
        { contractId, firstMessage: userMessage },
        {
          onSuccess: (data) => {
            setLocalSessionId(data.id);
            setSessionId(data.id);
            // Send message with the new session ID
            sendMessageWithSession(data.id, userMessage);
          },
          onError: (error: unknown) => {
            console.error("Error creating session:", error);
            toast.error("Không thể khởi tạo chat session");
          },
        }
      );
      return;
    }

    if (!effectiveSessionId) return;

    sendMessageWithSession(effectiveSessionId, userMessage);
  };

  const sendMessageWithSession = async (sessionId: string, userMessage: string) => {
    if (!userMessage.trim() || sending) return;

    setInput("");
    
    // Optimistic update for user message
    const optimisticUserMessage: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      sessionId: sessionId,
      content: userMessage,
      role: "user",
      createdAt: new Date().toISOString(),
    };
    
    // Create placeholder for assistant response
    const assistantMessageId = `temp-assistant-${Date.now()}`;
    const optimisticAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      sessionId: sessionId,
      content: "",
      role: "assistant",
      createdAt: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);
    setSending(true);

    let fullAnswer = "";
    let citations: Citation[] | undefined;

    try {
      await streamMessage(
        sessionId,
        userMessage,
        undefined,
        {
          onStart: () => {
            // Stream started
          },
          onDelta: (delta: string) => {
            fullAnswer += delta;
            // Update the assistant message in real-time
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: fullAnswer }
                  : m
              )
            );
            // Auto-scroll to bottom as content streams
            setTimeout(() => scrollToBottom(), 0);
          },
          onEnd: (receivedCitations) => {
            citations = receivedCitations;
            // Final update with citations
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== assistantMessageId);
              return [
                ...filtered,
                {
                  id: assistantMessageId,
                  sessionId: sessionId,
                  content: fullAnswer,
                  role: "assistant" as const,
                  createdAt: new Date().toISOString(),
                  ...(citations && { citations }),
                },
              ];
            });
          },
          onError: (error: string) => {
            console.error("Error sending message:", error);
            toast.error(error || "Không thể gửi message");
            // Remove both optimistic messages on error
            setMessages((prev) =>
              prev.filter(
                (m) => m.id !== optimisticUserMessage.id && m.id !== assistantMessageId
              )
            );
            setInput(userMessage); // Restore input
          },
        }
      );
    } catch (error: unknown) {
      console.error("Error sending message:", error);
      const errorMessage = error && typeof error === 'object' && 'message' in error 
        ? String(error.message) 
        : "Không thể gửi message";
      toast.error(errorMessage);
      // Remove both optimistic messages on error
      setMessages((prev) =>
        prev.filter(
          (m) => m.id !== optimisticUserMessage.id && m.id !== assistantMessageId
        )
      );
      setInput(userMessage); // Restore input
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã copy!");
  };

  const handleSelectSession = (sessionId: string) => {
    setLocalSessionId(sessionId);
    setSessionId(sessionId);
    setHistoryOpen(false); // Close dropdown after selecting
  };

  const handleNewChat = () => {
    setLocalSessionId(null);
    setSessionId("");
    setMessages([]);
    setHistoryOpen(false); // Close dropdown after clicking new chat
  };

  const isDraftMode = !effectiveSessionId && messages.length === 0;

  const handleStartEdit = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle || "");
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveEdit = () => {
    if (!editingSessionId || !editingTitle.trim()) {
      setEditingSessionId(null);
      return;
    }

    updateSessionTitle.mutate(
      { sessionId: editingSessionId, title: editingTitle.trim() },
      {
        onSuccess: () => {
          toast.success("Đã cập nhật tên session");
          setEditingSessionId(null);
        },
        onError: (error: unknown) => {
          console.error("Error updating session title:", error);
          toast.error("Không thể cập nhật tên session");
        },
      }
    );
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleDeleteSession = (sessionId: string) => {
    if (!confirm("Bạn có chắc muốn xóa session này?")) return;

    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        toast.success("Đã xóa session");
        // If deleting current session, clear it
        if (effectiveSessionId === sessionId) {
          handleNewChat();
        }
      },
      onError: (error: unknown) => {
        console.error("Error deleting session:", error);
        toast.error("Không thể xóa session");
      },
    });
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full border-l bg-background">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Chat</h3>
        <div className="flex items-center gap-2">
          <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <History className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={handleNewChat}>
                <MessageSquare className="mr-2 h-4 w-4" />
                <span className="font-medium">New Chat</span>
              </DropdownMenuItem>
              {sessionsLoading ? (
                <DropdownMenuItem disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </DropdownMenuItem>
              ) : (
                <div className="space-y-1">
                 
                  {sessions.length > 0 && (
                    <div className="px-2 pt-1.5 text-xs font-semibold text-muted-foreground">
                      History
                    </div>
                  )}
                  <div className="space-y-1 max-h-[calc(100vh-350px)] overflow-y-auto">
                    {/* Show draft "New chat" item when in draft mode */}
                    {isDraftMode && (
                      <div
                        className="group min-h-10 relative flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer bg-accent text-accent-foreground rounded-sm"
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate font-medium">New chat</span>
                          <span className="text-xs opacity-60">Draft</span>
                        </div>
                      </div>
                    )}
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`group min-h-12 relative flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:*:text-accent-foreground rounded-sm ${
                          effectiveSessionId === s.id ? "bg-accent text-accent-foreground **:text-accent-foreground" : ""
                        }`}
                        onMouseEnter={() => setHoveredSessionId(s.id)}
                        onMouseLeave={() => setHoveredSessionId(null)}
                        onClick={() => {
                          if (editingSessionId !== s.id) {
                            handleSelectSession(s.id);
                          }
                        }}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          {editingSessionId === s.id ? (
                            <Input
                              ref={editInputRef}
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              onBlur={handleCancelEdit}
                              className="h-6 px-2 text-sm"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <span className="truncate">
                                {s.title || `Session ${s.id.slice(0, 8)}`}
                              </span>
                              <span className="text-xs opacity-60">
                                {format(new Date(s.createdAt), "MMM d, HH:mm")}
                              </span>
                            </>
                          )}
                        </div>
                        {hoveredSessionId === s.id && editingSessionId !== s.id && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {editingSessionId === s.id ? (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="hover:**:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveEdit();
                                }}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="hover:**:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(s.id, s.title || "");
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="hover:**:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(s.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {sessions.length === 0 && !isDraftMode && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No history
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <div>
              <p className="text-lg font-medium mb-2">Bắt đầu chat</p>
              <p className="text-sm">Đặt câu hỏi về contract này</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            if ("role" in message) {
              // ChatMessage
              return (
                <div key={message.id || index} className="space-y-2">
                  <div
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {format(new Date(message.createdAt), "HH:mm")}
                      </p>
                    </div>
                  </div>
                  {/* {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value={`citations-${message.id}`} className="border-none">
                        <AccordionTrigger className="text-xs py-2">
                          Citations ({message.citations.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {message.citations.map((citation: Citation, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs"
                              >
                                <div className="flex-1">
                                  <p>n: {citation.n}</p>
                                  <p>chunkIndex: {citation.chunkIndex}</p>
                                  <p>distance: {citation.distance.toFixed(4)}</p>
                                  <p className="font-mono truncate max-w-[200px]">
                                    chunkId: {citation.chunkId}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleCopy(citation.chunkId)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )} */}
                </div>
              );
            } else {
              // ChatResponse (legacy format, keep for backward compatibility)
              return (
                <div key={`response-${index}`} className="space-y-2">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                      <p className="text-sm whitespace-pre-wrap">{message.answer}</p>
                    </div>
                  </div>
                  {message.citations && message.citations.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="citations" className="border-none">
                        <AccordionTrigger className="text-xs py-2">
                          Citations ({message.citations.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {message.citations.map((citation: Citation, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs"
                              >
                                <div className="flex-1">
                                  <p>n: {citation.n}</p>
                                  <p>chunkIndex: {citation.chunkIndex}</p>
                                  <p>distance: {citation.distance.toFixed(4)}</p>
                                  <p className="font-mono truncate max-w-[200px]">
                                    chunkId: {citation.chunkId}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleCopy(citation.chunkId)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              );
            }
          })
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg p-3 bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi..."
            className="min-h-[60px] resize-none"
            disabled={sending}
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            size="sm"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
