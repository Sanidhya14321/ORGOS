"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function HelpChatDock() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Ask about ORGOS features or your company handbooks in the knowledge base (e.g. policies, RERE handbook topics)."
    }
  ]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const openDock = () => setOpen(true);
    window.addEventListener("orgos:open-help", openDock);
    return () => window.removeEventListener("orgos:open-help", openDock);
  }, []);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    setInput("");
    const nextThread: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextThread);
    setPending(true);
    try {
      const res = await apiFetch<{ reply: string }>("/api/help/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, pathname })
      });
      setMessages((prev) => [...prev, { role: "assistant", text: res.reply }]);
    } catch (e) {
      const msg = e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
      setMessages((prev) => [...prev, { role: "assistant", text: `Could not reach help: ${msg}` }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 md:bottom-6 md:right-6">
      {open ? (
        <div
          className={cn(
            "pointer-events-auto flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl border border-border",
            "bg-bg-surface/95 shadow-xl backdrop-blur-md"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-text-primary">Help</span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close help">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-2 text-sm">
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={cn(
                  "rounded-lg px-2 py-1.5",
                  m.role === "user" ? "ml-4 bg-accent/15 text-text-primary" : "mr-4 bg-bg-elevated text-text-secondary"
                )}
              >
                {m.text}
              </div>
            ))}
            {pending ? <p className="text-xs text-text-muted">Thinking…</p> : null}
          </div>
          <div className="border-t border-border p-2">
            <Textarea
              rows={2}
              placeholder="Where do I import positions? What is vectorless?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" size="sm" disabled={pending || !input.trim()} onClick={() => void send()}>
                <Send className="mr-1 h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="pointer-events-auto h-12 rounded-full px-4 shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MessageCircle className="mr-2 h-5 w-5" />
        Help
      </Button>
    </div>
  );
}
