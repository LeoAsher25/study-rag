"use client";

import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { BackendOfflineBanner } from "./backend-offline-banner";
import { useState } from "react";
import { CreateContractModal } from "@/components/contracts/create-contract-modal";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header onCreateContract={() => setShowCreateModal(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-background flex flex-col">
          <BackendOfflineBanner />
          <div className="flex-1 max-h-full">{children}</div>
        </main>
      </div>
      <CreateContractModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </div>
  );
}
