"use client";

import { io, type Socket } from "socket.io-client";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgosStore, type OrgosState } from "@/store";

const SOCKET_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
let socketSingleton: Socket | null = null;

function ensureSocket(): Socket {
  if (socketSingleton) {
    return socketSingleton;
  }

  socketSingleton = io(SOCKET_BASE, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    withCredentials: true
  });

  return socketSingleton;
}

export function connectSocket(): Socket {
  const socket = ensureSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socketSingleton?.connected) {
    socketSingleton.disconnect();
  }
}

export function useSocket(): Socket {
  const setWsConnected = useOrgosStore((state: OrgosState) => state.setWsConnected);
  const socket = useMemo(() => ensureSocket(), []);

  useEffect(() => {
    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, setWsConnected]);

  return socket;
}

export function useRealtimeQueryInvalidation(enabled = true): void {
  const queryClient = useQueryClient();
  const socket = useSocket();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const invalidateTasks = () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };
    const invalidateGoals = () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    };
    const invalidateOrg = () => {
      void queryClient.invalidateQueries({ queryKey: ["pending-members"] });
      void queryClient.invalidateQueries({ queryKey: ["org-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
    };

    const taskEvents = [
      "task:assigned",
      "task:status_changed",
      "task:report_submitted",
      "task:routing_ready",
      "task:routing_confirmed",
      "task:blocked",
      "task:mentioned",
      "task:sla_at_risk",
      "task:sla_breached"
    ] as const;

    const onConnect = () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      invalidateTasks();
      invalidateGoals();
      invalidateOrg();
    };
    const onGoalDecomposed = () => {
      invalidateGoals();
      invalidateTasks();
    };

    for (const event of taskEvents) {
      socket.on(event, invalidateTasks);
    }
    socket.on("goal:decomposed", onGoalDecomposed);
    socket.on("goal:progress", onGoalDecomposed);
    socket.on("agent:executing", invalidateTasks);
    socket.on("agent:escalated", invalidateTasks);
    socket.on("connect", onConnect);

    return () => {
      for (const event of taskEvents) {
        socket.off(event, invalidateTasks);
      }
      socket.off("goal:decomposed", onGoalDecomposed);
      socket.off("goal:progress", onGoalDecomposed);
      socket.off("agent:executing", invalidateTasks);
      socket.off("agent:escalated", invalidateTasks);
      socket.off("connect", onConnect);
    };
  }, [enabled, queryClient, socket]);
}
