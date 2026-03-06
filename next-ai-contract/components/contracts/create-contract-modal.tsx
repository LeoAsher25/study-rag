"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2 } from "lucide-react";
import { useCreateContract, useUploadFile } from "@/lib/queries";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface CreateContractModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function CreateContractModal({ open, onOpenChange }: CreateContractModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  
  const createContract = useCreateContract();
  const uploadFile = useUploadFile();
  
  const loading = createContract.isPending || uploadFile.isPending;
  const loadingStep = createContract.isPending ? "creating" : uploadFile.isPending ? "uploading" : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (selectedFile.type !== "application/pdf") {
      toast.error("Chỉ chấp nhận file PDF");
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("File không được vượt quá 50MB");
      return;
    }

    setFile(selectedFile);

    // Auto-fill title if empty
    if (!title.trim()) {
      const fileName = selectedFile.name.replace(/\.pdf$/i, "");
      setTitle(fileName);
    }
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) {
      toast.error("Vui lòng chọn file và nhập tên contract");
      return;
    }

    try {
      // Step 1: Create contract
      const contract = await createContract.mutateAsync(title.trim());

      // Step 2: Upload file
      const uploadResult = await uploadFile.mutateAsync({
        contractId: contract.id,
        file,
      });

      if (uploadResult.status === "FAILED") {
        toast.error(uploadResult.message || "Upload thất bại");
        // Still navigate to detail page for retry
        router.push(`/contracts/${contract.id}`);
        onOpenChange(false);
        resetForm();
        return;
      }

      toast.success("Tạo contract thành công!");
      router.push(`/contracts/${contract.id}`);
      onOpenChange(false);
      resetForm();
    } catch (error: unknown) {
      console.error("Error creating contract:", error);
      const errorMessage = error && typeof error === 'object' && 'message' in error 
        ? String(error.message) 
        : "Có lỗi xảy ra khi tạo contract";
      toast.error(errorMessage);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !loading) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tạo contract mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Upload PDF</Label>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={loading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full"
              >
                <Upload className="mr-2 h-4 w-4" />
                {file ? file.name : "Chọn file PDF"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tối đa 50MB, chỉ chấp nhận file PDF
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Tên contract</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tên contract"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingStep === "creating" ? "Creating…" : "Uploading…"}
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
