"use client";

import { useEffect } from "react";

export default function LivePreviewFrame({
  onScrapeComplete,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
  onScrapeComplete?: () => void;
}) {
  useEffect(() => {
    onScrapeComplete?.();
  }, [onScrapeComplete]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {children}
    </div>
  );
}
