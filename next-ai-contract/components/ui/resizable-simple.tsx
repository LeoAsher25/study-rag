"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelGroupProps {
  direction?: "horizontal" | "vertical";
  className?: string;
  children: React.ReactNode;
}

interface ResizablePanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

interface ResizableHandleProps {
  withHandle?: boolean;
  className?: string;
}

export function ResizablePanelGroup({
  direction = "horizontal",
  className,
  children,
}: ResizablePanelGroupProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full",
        direction === "vertical" ? "flex-col" : "flex-row",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ResizablePanel({
  defaultSize = 50,
  minSize = 20,
  maxSize = 80,
  className,
  children,
  style,
}: ResizablePanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (panelRef.current) {
      // Store min/max as data attributes for ResizableHandle to read
      panelRef.current.dataset.minSize = minSize.toString();
      panelRef.current.dataset.maxSize = maxSize.toString();
    }
  }, [minSize, maxSize]);

  return (
    <div
      ref={panelRef}
      className={cn("relative", className)}
      style={{ flex: `0 0 ${defaultSize}%`, ...style }}
      data-min-size={minSize}
      data-max-size={maxSize}
    >
      <div className="h-full w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function ResizableHandle({ withHandle, className }: ResizableHandleProps) {
  const [isResizing, setIsResizing] = React.useState(false);
  const handleRef = React.useRef<HTMLDivElement>(null);
  const startPosRef = React.useRef<number>(0);
  const leftPanelRef = React.useRef<HTMLElement | null>(null);
  const rightPanelRef = React.useRef<HTMLElement | null>(null);
  const leftStartSizeRef = React.useRef<number>(0);
  const rightStartSizeRef = React.useRef<number>(0);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!handleRef.current) return;

    const container = handleRef.current.parentElement;
    if (!container) return;

    const isHorizontal = container.classList.contains("flex-row");
    const panels = Array.from(container.children) as HTMLElement[];
    const handleIndex = panels.indexOf(handleRef.current);
    
    leftPanelRef.current = panels[handleIndex - 1] as HTMLElement;
    rightPanelRef.current = panels[handleIndex + 1] as HTMLElement;

    if (!leftPanelRef.current || !rightPanelRef.current) return;

    const leftStyle = window.getComputedStyle(leftPanelRef.current);
    const rightStyle = window.getComputedStyle(rightPanelRef.current);
    
    leftStartSizeRef.current = parseFloat(leftStyle.flexBasis) || 50;
    rightStartSizeRef.current = parseFloat(rightStyle.flexBasis) || 50;
    
    startPosRef.current = isHorizontal ? e.clientX : e.clientY;
    setIsResizing(true);
  }, []);

  React.useEffect(() => {
    if (!isResizing || !handleRef.current) return;

    const container = handleRef.current.parentElement;
    if (!container || !leftPanelRef.current || !rightPanelRef.current) return;

    const isHorizontal = container.classList.contains("flex-row");

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const startPos = isHorizontal
        ? startPosRef.current - containerRect.left
        : startPosRef.current - containerRect.top;
      
      const containerSize = isHorizontal ? containerRect.width : containerRect.height;
      const mousePos = isHorizontal
        ? e.clientX - containerRect.left
        : e.clientY - containerRect.top;
      
      const delta = ((mousePos - startPos) / containerSize) * 100;
      
      const newLeftSize = leftStartSizeRef.current + delta;
      const newRightSize = rightStartSizeRef.current - delta;

      // Get min/max constraints from panel data attributes
      const leftMin = parseFloat(leftPanelRef.current?.dataset.minSize || '20');
      const leftMax = parseFloat(leftPanelRef.current?.dataset.maxSize || '80');
      const rightMin = parseFloat(rightPanelRef.current?.dataset.minSize || '20');
      const rightMax = parseFloat(rightPanelRef.current?.dataset.maxSize || '80');

      // Apply constraints using panel-specific min/max values
      const clampedLeft = Math.max(leftMin, Math.min(leftMax, newLeftSize));
      const clampedRight = Math.max(rightMin, Math.min(rightMax, newRightSize));

      if (leftPanelRef.current) leftPanelRef.current.style.flex = `0 0 ${clampedLeft}%`;
      if (rightPanelRef.current) rightPanelRef.current.style.flex = `0 0 ${clampedRight}%`;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      ref={handleRef}
      className={cn(
        "bg-border relative flex w-px items-center justify-center cursor-col-resize hover:bg-primary/50 transition-colors select-none",
        isResizing && "bg-primary/70",
        "group",
        className
      )}
      onMouseDown={handleMouseDown}
    >
      {withHandle && (
        <div className="bg-border h-6 w-1 rounded-lg z-10 flex shrink-0 group-hover:bg-primary" />
      )}
    </div>
  );
}
