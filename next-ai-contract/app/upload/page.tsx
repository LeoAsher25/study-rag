"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";
import { useCreateContract, useUploadFile } from "@/lib/queries";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadPage() {
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

    if (selectedFile.type !== "application/pdf") {
      toast.error("Chỉ chấp nhận file PDF");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("File không được vượt quá 50MB");
      return;
    }

    setFile(selectedFile);

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
      const contract = await createContract.mutateAsync(title.trim());

      const uploadResult = await uploadFile.mutateAsync({
        contractId: contract.id,
        file,
      });

      if (uploadResult.status === "FAILED") {
        toast.error(uploadResult.message || "Upload thất bại");
        router.push(`/contracts/${contract.id}`);
        return;
      }

      toast.success("Tạo contract thành công!");
      router.push(`/contracts/${contract.id}`);
    } catch (error: unknown) {
      console.error("Error creating contract:", error);
      const errorMessage = error && typeof error === 'object' && 'message' in error 
        ? String(error.message) 
        : "Có lỗi xảy ra khi tạo contract";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Upload Contract</h1>
          <p className="text-muted-foreground">
            Upload file PDF để tạo contract mới
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-6">
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

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => router.back()}
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
          </div>
        </div>
      </div>
    </div>
  );
}
