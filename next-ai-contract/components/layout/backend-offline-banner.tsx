"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { useBackendHealth } from "@/lib/queries";

export function BackendOfflineBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data: isHealthy, isLoading, refetch } = useBackendHealth();
  
  // Don't show banner while loading or if backend is healthy
  if (isLoading || isHealthy || dismissed) return null;

  const handleRetry = () => {
    refetch();
  };

  return (
    <div className="px-4 my-4">
      <Alert variant="destructive" className="border-destructive flex items-center">
        <AlertCircle className="h-4 w-4 -mt-1" />
        <AlertDescription className="flex items-center justify-between flex-1">
          <span>
            Không kết nối được backend tại{" "}
            {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4001/api/v1"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="h-7"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
