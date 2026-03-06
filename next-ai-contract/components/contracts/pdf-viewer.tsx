"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDF_VIEWER_MIN_WIDTH } from "@/app/constants";


// Set up PDF.js worker - use local worker from node_modules
  // pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(error: Error) {
    setLoading(false);
    setError(`Failed to load PDF: ${error.message}`);
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => (numPages ? Math.min(numPages, prev + 1) : prev));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.2));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Error loading PDF</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">URL: {fileUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {loading ? "Loading..." : `Page ${pageNumber} of ${numPages || 0}`}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToNextPage}
            disabled={pageNumber >= (numPages || 0) || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={zoomOut} disabled={loading}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon-sm" onClick={zoomIn} disabled={loading}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 p-4 flex justify-center">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-[600px] w-full max-w-2xl" />
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-[600px] w-full max-w-2xl" />
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              className="shadow-lg"
              renderTextLayer={true}
              width={PDF_VIEWER_MIN_WIDTH}
              renderAnnotationLayer={true}
              loading={
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[600px] w-full max-w-2xl" />
                </div>
              }
            />
          </Document>
        )}
      </div>
    </div>
  );
}
