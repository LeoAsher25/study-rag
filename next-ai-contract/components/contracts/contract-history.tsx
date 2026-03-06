"use client";

import { ContractFile } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState, useRef } from "react";
import { useUploadFile } from "@/lib/queries";

interface ContractHistoryProps {
  contractId: string;
  files: ContractFile[];
  onUploadSuccess: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function ContractHistory({ contractId, files, onUploadSuccess }: ContractHistoryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [versionNumber, setVersionNumber] = useState<string>("");
  
  const uploadFile = useUploadFile();
  const uploading = uploadFile.isPending;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã copy!");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      toast.error("Chỉ chấp nhận file PDF");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("File không được vượt quá 50MB");
      return;
    }

    try {
      const versionNum = versionNumber ? parseInt(versionNumber, 10) : undefined;
      await uploadFile.mutateAsync({
        contractId,
        file: selectedFile,
        versionNumber: versionNum,
      });
      toast.success("Upload thành công!");
      onUploadSuccess();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setVersionNumber("");
    } catch (error: unknown) {
      console.error("Error uploading file:", error);
      const errorMessage = error && typeof error === 'object' && 'message' in error 
        ? String(error.message) 
        : "Upload thất bại";
      toast.error(errorMessage);
    }
  };

  const getUploadedTime = (file: ContractFile) => {
    const raw = file.uploadedAt ?? file.uploaded_at;
    if (raw == null || raw === "") return 0;
    const t = new Date(raw).getTime();
    return isNaN(t) ? 0 : t;
  };

  const formatUploadedAt = (file: ContractFile) => {
    const raw = file.uploadedAt ?? file.uploaded_at;
    if (raw == null || raw === "") return "—";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy HH:mm");
  };

  const sortedFiles = [...files].sort((a, b) => {
    return getUploadedTime(b) - getUploadedTime(a); // newest first
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Version History</h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
          <input
            type="number"
            placeholder="Version (optional)"
            value={versionNumber}
            onChange={(e) => setVersionNumber(e.target.value)}
            className="h-9 rounded-md border border-input px-2.5 text-sm w-32"
            disabled={uploading}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading…" : "Upload new version"}
          </Button>
        </div>
      </div>

      {sortedFiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Chưa có file nào được upload</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead>Contract File ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiles.map((file) => (
                <TableRow key={file.contractFileId}>
                  <TableCell className="font-medium">
                    {file.versionNumber ?? "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={file.status === "READY" ? "default" : "destructive"}
                    >
                      {file.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatUploadedAt(file)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {file.contractFileId}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleCopy(file.contractFileId)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
