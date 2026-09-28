import { LockIcon } from "./icons";
import { Mark } from "./Logo";

const bar = "rounded-full bg-screen-500";

/** Decorative product mock-up: a viewer window, the consent prompt and the encrypted link. */
export function HeroArt() {
  return (
    <div
      role="img"
      aria-label="An ASDesk session: the remote computer has approved the request and the connection is encrypted"
      className="relative mx-auto grid aspect-[6/5] w-full max-w-xl place-items-center"
    >
      <div className="absolute h-[55%] w-[110%] -rotate-12 rounded-[50%] border border-fg/10" />
      <div className="absolute h-[85%] w-[80%] rotate-[40deg] rounded-[50%] border border-fg/[0.07]" />

      {/* Viewer window */}
      <div className="relative z-10 w-[86%] -rotate-3 overflow-hidden rounded-2xl border border-white/10 bg-screen-800 shadow-2xl shadow-black/40">
        <div className="flex h-9 items-center gap-2 bg-screen-700 px-3.5 text-[10px] text-screen-500">
          <Mark className="h-3.5" />
          <span className="text-slate-300">ASDesk</span>
          <span className="ml-3 hidden rounded-md bg-screen-800 px-2 py-1 text-slate-300 sm:inline">482 913 075</span>
          <span className="hidden rounded-md px-2 py-1 text-slate-400 sm:inline">671 204 338</span>
          <span className="ml-auto flex items-center gap-1.5 text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            Connected
          </span>
        </div>
        <div className="flex aspect-[16/9]">
          <div className="flex w-[18%] flex-col gap-3.5 border-r border-screen-600 p-[5%]">
            <span className="h-3.5 w-full rounded bg-brand-600" />
            <span className={`h-1.5 w-4/5 ${bar}`} />
            <span className={`h-1.5 w-4/5 ${bar}`} />
            <span className={`h-1.5 w-3/5 ${bar}`} />
          </div>
          <div className="flex flex-1 flex-col p-[5%]">
            <span className="h-2.5 w-2/5 rounded-full bg-slate-300" />
            <div className="mt-[6%] grid flex-1 grid-cols-2 gap-2.5">
              <span className="rounded-lg border border-emerald-400/60 bg-emerald-400/15" />
              <span className="rounded-lg border border-screen-600 bg-screen-700" />
              <span className="rounded-lg border border-screen-600 bg-screen-700" />
              <span className="rounded-lg border border-screen-600 bg-screen-700" />
            </div>
            <div className="mt-[6%] flex gap-1.5">
              <span className={`h-1.5 w-10 ${bar}`} />
              <span className={`h-1.5 w-10 ${bar}`} />
              <span className={`h-1.5 w-10 ${bar}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Consent prompt on the shared computer */}
      <div className="absolute right-0 bottom-[8%] z-20 w-56 rotate-2 rounded-xl border border-line bg-surface/95 p-3.5 shadow-xl shadow-black/20 backdrop-blur sm:w-60">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-sky-300 text-xs font-bold text-slate-900">
            S
          </span>
          <div className="min-w-0 text-xs leading-tight">
            <p className="font-semibold text-fg">Sam wants to connect</p>
            <p className="mt-0.5 text-subtle">View · Control · Clipboard</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold">
          <span className="rounded-md border border-line py-1.5 text-center text-muted">Decline</span>
          <span className="rounded-md bg-brand-600 py-1.5 text-center text-white">Accept &amp; share</span>
        </div>
      </div>

      {/* Encryption badge */}
      <div className="absolute bottom-[3%] left-[4%] z-20 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2 text-[11px] font-medium text-muted shadow-lg shadow-black/15 backdrop-blur">
        <LockIcon className="size-3.5 text-emerald-500" />
        End-to-end encrypted
      </div>
    </div>
  );
}
