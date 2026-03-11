"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useContract } from "@/lib/queries";
import { ContractFile } from "@/types";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable-simple";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractHistory } from "@/components/contracts/contract-history";

const PdfViewer = dynamic(
  () => import("@/components/contracts/pdf-viewer").then((mod) => ({ default: mod.PdfViewer })),
  { ssr: false }
);
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatFloatingButton } from "@/components/chat/chat-floating-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { PDF_VIEWER_MIN_WIDTH } from "@/app/constants";
const CONTENT_PANEL_WIDTH =  PDF_VIEWER_MIN_WIDTH + 81; // 81 is the total padding


export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const { data: contract, isLoading: loading, error, refetch } = useContract(contractId);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  // Choose file for viewer:
  // - Prefer newest READY file (ingested, ready for RAG)
  // - If none, fall back to newest uploaded file so user can still view PDF
  const viewerFile = useMemo(() => {
    if (!contract?.files) return null;
    
    const getUploadedTime = (f: ContractFile) => {
      const r = f.uploadedAt ?? f.uploaded_at;
      if (r == null || r === "") return 0;
      const t = new Date(r).getTime();
      return isNaN(t) ? 0 : t;
    };
    
    const readyFiles = contract.files
      .filter((f) => f.status === "READY")
      .sort((a, b) => getUploadedTime(b) - getUploadedTime(a));

    if (readyFiles[0]) return readyFiles[0];

    // Fallback: newest file regardless of status (e.g. UPLOADED)
    const sortedAll = [...contract.files].sort(
      (a, b) => getUploadedTime(b) - getUploadedTime(a)
    );
    return sortedAll[0] || null;
  }, [contract]);

  const handleUploadSuccess = () => {
    refetch();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const errorStatus = error && typeof error === 'object' && 'status' in error ? error.status : null;
  const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : null);

  if (errorStatus === 404) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Không tìm thấy contract</h2>
          <p className="text-muted-foreground">
            Contract với ID này không tồn tại
          </p>
          <Button onClick={() => router.push("/contracts")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại Contracts
          </Button>
        </div>
      </div>
    );
  }

  if (error && errorStatus !== 404) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Lỗi</h2>
          <p className="text-muted-foreground">{errorMessage || "Không tải được dữ liệu"}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  // Get PDF URL from backend response (url field)
  const pdfUrl = viewerFile?.url || null;


  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4 bg-background">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{contract.title}</h1>
            <p className="text-sm text-muted-foreground">Contract ID: {contract.id}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {chatOpen ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={70} minSize={30} maxSize={80}>
              <div className="h-full p-6">
                <Tabs defaultValue="general" className="h-full flex flex-col">
                  <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="flex-1 overflow-hidden mt-4">
                    {pdfUrl ? (
                      <div className="h-full border rounded-lg overflow-hidden">
                        <PdfViewer fileUrl={pdfUrl} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
                        <div className="text-center space-y-2">
                          <p className="text-muted-foreground">Chưa có file PDF nào</p>
                          <p className="text-sm text-muted-foreground">
                            Upload file PDF trong tab History
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="flex-1 overflow-auto mt-4">
                    <ContractHistory
                      contractId={contractId}
                      files={contract.files}
                      onUploadSuccess={handleUploadSuccess}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={80} 
              style={{
                maxWidth: `calc(100% - ${CONTENT_PANEL_WIDTH}px)`,
              }}
            >
              <ChatPanel
                contractId={contractId}
                isOpen={chatOpen}
                onClose={() => setChatOpen(false)}
                sessionId={chatSessionId}
                setSessionId={setChatSessionId}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full p-6">
            <Tabs defaultValue="general" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="flex-1 overflow-hidden mt-4">
                {pdfUrl ? (
                  <div className="h-full border rounded-lg overflow-hidden">
                    <PdfViewer key={pdfUrl} fileUrl={pdfUrl} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
                    <div className="text-center space-y-2">
                      <p className="text-muted-foreground">Chưa có file PDF nào</p>
                      <p className="text-sm text-muted-foreground">
                        Upload file PDF trong tab History
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-auto mt-4">
                <ContractHistory
                  contractId={contractId}
                  files={contract.files}
                  onUploadSuccess={handleUploadSuccess}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {!chatOpen && (
        <ChatFloatingButton onClick={() => setChatOpen(true)} />
      )}
    </div>
  );
}
