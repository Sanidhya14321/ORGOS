import type { ReactNode } from "react";

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  layout?: "split" | "stack";
};

export function AppShell({ eyebrow, title, description, children, layout = "split" }: AppShellProps) {
  if (layout === "stack") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 py-8 sm:px-6 lg:px-10">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7280] sm:text-sm sm:tracking-[0.3em]">{eyebrow}</p>
          <h1 className="mt-3 break-words font-serif text-3xl leading-tight text-[#121826] sm:text-4xl lg:text-6xl">{title}</h1>
          <p className="mt-4 max-w-4xl break-words text-base leading-7 text-[#4b5563]">{description}</p>
        </section>
        <section className="mt-6 min-w-0">
          {children}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7280] sm:text-sm sm:tracking-[0.3em]">{eyebrow}</p>
          <h1 className="mt-4 break-words font-serif text-3xl leading-tight text-[#121826] sm:text-5xl lg:text-7xl">{title}</h1>
          <p className="mt-5 max-w-2xl break-words text-base leading-7 text-[#4b5563] sm:text-lg sm:leading-8">{description}</p>
        </section>
        <section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_80px_rgba(18,24,38,0.12)] backdrop-blur-xl sm:p-6">
          {children}
        </section>
      </div>
    </main>
  );
}