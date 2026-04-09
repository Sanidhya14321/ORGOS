"use client";

import { io, type Socket } from "socket.io-client";
import { useEffect, useMemo } from "react";
import { getAccessTokenFromBrowser } from "./auth";
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
    transports: ["websocket"],
    auth: {
      token: getAccessTokenFromBrowser()
    }
  });

  return socketSingleton;
}

export function connectSocket(): Socket {
  const socket = ensureSocket();
  socket.auth = { token: getAccessTokenFromBrowser() };
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
