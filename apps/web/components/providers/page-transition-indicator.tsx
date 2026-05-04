"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LoadingScreen } from "@/components/loading-screen";

const MIN_VISIBLE_MS = 180;
const AUTO_HIDE_MS = 700;

export function PageTransitionIndicator() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    let hideTimer: number | undefined;
    let minTimer: number | undefined;

    setVisible(true);

    minTimer = window.setTimeout(() => {
      hideTimer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }, MIN_VISIBLE_MS);

    return () => {
      if (minTimer !== undefined) {
        window.clearTimeout(minTimer);
      }
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [pathname]);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(255,241,224,0.34)] px-4 backdrop-blur-md">
      <div className="animate-rise-in shadow-[0_18px_40px_rgba(164,89,9,0.08)]">
        <LoadingScreen compact />
      </div>
    </div>
  );
}