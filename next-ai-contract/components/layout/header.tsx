"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Wifi, WifiOff } from "lucide-react";
import { useBackendHealth } from "@/lib/queries";

interface HeaderProps {
  onCreateContract: () => void;
}

export function Header({ onCreateContract }: HeaderProps) {
  const { data: isOnline = false } = useBackendHealth();

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Contract AI</h1>
        </div>

        <div className="flex items-center gap-4">
          <Badge
            variant={isOnline ? "default" : "destructive"}
            className="gap-1.5"
          >
            {isOnline ? (
              <>
                <Wifi className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                Offline
              </>
            )}
          </Badge>

          <Button onClick={onCreateContract} size="default">
            Tạo contract
          </Button>
        </div>
      </div>
    </header>
  );
}
