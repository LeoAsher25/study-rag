"use client";

import { useState, useMemo } from "react";
import { useContracts } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, Search, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CreateContractModal } from "@/components/contracts/create-contract-modal";

function getContractStatusBadge(status?: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" } {
  switch (status) {
    case "READY":
      return { label: "Ready", variant: "default" };
    case "FAILED":
      return { label: "Failed", variant: "destructive" };
    case "EXTRACTED":
      return { label: "Extracted", variant: "secondary" };
    case "EMBEDDED":
      return { label: "Embedded", variant: "secondary" };
    case "UPLOADED":
      return { label: "Uploaded", variant: "outline" };
    default:
      return { label: "Pending", variant: "outline" };
  }
}

export default function ContractsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: contracts = [], isLoading: loading, error, refetch } = useContracts();

  console.log("contracts error: ", error)

  const filteredContracts = useMemo(() => {
    if (!contracts) return [];
    return contracts.filter((contract) =>
      contract.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [contracts, searchQuery]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : "Không tải được dữ liệu";
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Không tải được dữ liệu</h2>
          <p className="text-muted-foreground">{errorMessage}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Contracts</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo contract
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm contract…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredContracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {searchQuery ? "Không tìm thấy contract" : "Chưa có contract nào"}
            </h2>
            <p className="text-muted-foreground">
              {searchQuery
                ? "Thử tìm kiếm với từ khóa khác"
                : "Bắt đầu bằng cách tạo contract mới"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Tạo contract
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Updated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => {
                  const { label, variant } = getContractStatusBadge(contract.status);
                  return (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/contracts/${contract.id}`)}
                    >
                      <TableCell className="font-medium">{contract.title}</TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(contract.createdAt), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        {format(new Date(contract.updatedAt), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateContractModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </>
  );
}
