"use client";

import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface ChatFloatingButtonProps {
  onClick: () => void;
}

export function ChatFloatingButton({ onClick }: ChatFloatingButtonProps) {
  return (
    <Button
      size="icon"
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
      onClick={onClick}
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
