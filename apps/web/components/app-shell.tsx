import type { ReactNode } from "react";

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AppShell({ eyebrow, title, description, children }: AppShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-12 lg:px-10">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#6b7280]">{eyebrow}</p>
          <h1 className="mt-4 font-serif text-5xl leading-tight text-[#121826] lg:text-7xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4b5563]">{description}</p>
        </section>
        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.12)] backdrop-blur-xl">
          {children}
        </section>
      </div>
    </main>
  );
}