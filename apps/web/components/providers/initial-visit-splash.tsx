"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/loading-screen";

const SPLASH_STORAGE_KEY = "orgos.initial-visit-loader-seen";
const SPLASH_DURATION_MS = 2600;

export function InitialVisitSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (window.localStorage.getItem(SPLASH_STORAGE_KEY) !== "1") {
        window.localStorage.setItem(SPLASH_STORAGE_KEY, "1");
        setVisible(true);
        timer = window.setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
      }
    } catch {
      setVisible(true);
      timer = window.setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    }

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(244,240,232,0.94)] px-4 backdrop-blur-xl">
      <div className="dashboard-surface w-full max-w-[760px] p-4 sm:p-6">
        <LoadingScreen />
      </div>
    </div>
  );
}