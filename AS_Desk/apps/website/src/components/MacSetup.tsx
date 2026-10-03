import type { ReactNode } from "react";
import { useDownload } from "../hooks";
import { formatSize } from "./Download";
import { TrafficLights } from "./HeroArt";
import { DownloadIcon, KeyboardIcon, MacIcon, PowerIcon, ShieldCheckIcon, WindowsIcon } from "./icons";
import { Mark } from "./Logo";
import { Container, SectionHeading, buttonClass, cx, focusRing } from "./ui";

// Small, decorative pictures of what each step looks like on the Mac. Not screenshots: they follow
// the site's light and dark themes, and use no Apple artwork.

/** A macOS window, drawn small. */
function MiniWindow({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("w-full max-w-64 overflow-hidden rounded-lg border border-line bg-surface text-[10px] shadow-lg shadow-black/10", className)}>
      <div className="relative flex h-6 items-center border-b border-line bg-raised px-2">
        <TrafficLights className="size-2" />
        <span className="absolute inset-x-0 text-center font-semibold text-subtle">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** The app's icon: the mark on a white tile, as in the Dock. */
function AppTile({ className }: { className?: string }) {
  return (
    <span className={cx("grid place-items-center rounded-[22%] bg-white shadow-md ring-1 ring-black/5", className)}>
      <Mark className="h-[42%]" />
    </span>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cx("relative h-3.5 w-6 shrink-0 rounded-full transition-colors", on ? "bg-emerald-500" : "bg-line")}>
      <span className={cx("absolute top-0.5 size-2.5 rounded-full bg-white shadow", on ? "right-0.5" : "left-0.5")} />
    </span>
  );
}

function InstallPicture() {
  return (
    <MiniWindow title="ASDesk">
      <div className="flex items-center justify-around py-2">
        <span className="flex flex-col items-center gap-1.5">
          <AppTile className="size-11" />
          <span className="font-medium text-fg">ASDesk</span>
        </span>
        <svg viewBox="0 0 60 16" className="w-12 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 8h52" strokeDasharray="4 3" />
          <path d="m50 3 6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex flex-col items-center gap-1.5">
          <svg viewBox="0 0 44 36" className="h-9 w-11" aria-hidden="true">
            <path d="M2 6a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3Z" className="fill-sky-400" />
            <path d="M2 12h40v19a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3Z" className="fill-sky-500" />
            <path d="M17 26l5-11 5 11M19 22h6" className="stroke-white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-medium text-fg">Applications</span>
        </span>
      </div>
    </MiniWindow>
  );
}

/** Not notarized: System Settings' Open Anyway. Notarized: the app in the menu bar, ready. */
function OpenPicture({ notarized }: { notarized: boolean }) {
  if (!notarized)
    return (
      <MiniWindow title="Privacy & Security">
        <p className="font-semibold text-fg">Security</p>
        <p className="mt-1 leading-snug text-muted">“ASDesk” was blocked to protect your Mac.</p>
        <div className="mt-2.5 flex justify-end">
          <span className="relative rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white shadow-sm">
            Open Anyway
            <svg viewBox="0 0 12 16" className="absolute -right-2 -bottom-3 h-4 w-3 drop-shadow" aria-hidden="true">
              <path d="M1 1v12l3.2-3 2.3 5 2-1-2.2-4.8H11Z" className="fill-white stroke-slate-900" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </MiniWindow>
    );
  return (
    <div className="w-full max-w-64 text-[10px]">
      <div className="flex h-6 items-center justify-end gap-3 rounded-t-lg border border-line bg-raised/90 px-2.5 font-medium text-fg">
        <span className="rounded bg-fg/10 px-1 py-0.5">
          <Mark className="h-2.5" />
        </span>
        <span className="text-subtle">Mon 9:41</span>
      </div>
      <div className="ml-auto w-44 -translate-x-6 rounded-b-lg border border-t-0 border-line bg-surface p-1.5 shadow-lg shadow-black/10">
        <p className="px-1.5 py-1 text-subtle">This computer: 251 686 119</p>
        <p className="rounded bg-accent px-1.5 py-1 font-medium text-white">Open ASDesk</p>
        <p className="px-1.5 py-1 text-subtle">End all sessions</p>
      </div>
    </div>
  );
}

function SharePicture() {
  return (
    <MiniWindow title="Choose what to share">
      <div className="grid grid-cols-2 gap-2">
        {["Display 1", "Display 2"].map((name, index) => (
          <span key={name} className="flex flex-col items-center gap-1">
            <span
              className={cx(
                "grid aspect-[16/10] w-full place-items-center rounded-md bg-screen-800",
                index === 0 ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "opacity-60",
              )}
            >
              <span className="h-1 w-1/2 rounded-full bg-screen-500" />
            </span>
            <span className={cx("font-medium", index === 0 ? "text-fg" : "text-subtle")}>{name}</span>
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex justify-end">
        <span className="rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white">Share</span>
      </div>
    </MiniWindow>
  );
}

function ControlPicture() {
  return (
    <MiniWindow title="Accessibility">
      <p className="leading-snug text-muted">Allow these apps to control your computer.</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        <li className="flex items-center gap-2 bg-accent/5 px-2 py-1.5">
          <AppTile className="size-4" />
          <span className="flex-1 font-semibold text-fg">ASDesk</span>
          <Toggle on />
        </li>
        <li className="flex items-center gap-2 px-2 py-1.5 opacity-50">
          <span className="size-4 rounded-[22%] bg-line" />
          <span className="h-1.5 flex-1 rounded-full bg-line" />
          <Toggle on={false} />
        </li>
      </ul>
    </MiniWindow>
  );
}

export function MacSetup() {
  const { find, isLoading } = useDownload();
  const mac = find("macos", "universal");
  const windows = find("standard", "x64");
  const notarized = mac?.notarized === true;

  const steps: Array<{ title: string; body: ReactNode; picture: ReactNode }> = [
    {
      title: "Drag it into Applications",
      body: "Open the downloaded disk image and drag ASDesk onto the Applications folder. One app for Apple silicon and Intel Macs.",
      picture: <InstallPicture />,
    },
    {
      title: "Open ASDesk",
      body: notarized ? (
        "Open it from Applications. Apple has checked it, so it opens like any other app, and it keeps your ID ready in the menu bar."
      ) : (
        <>
          Open it from Applications. If macOS says it cannot verify ASDesk, go to System Settings →{" "}
          <strong className="font-semibold text-fg">Privacy &amp; Security</strong> and choose{" "}
          <strong className="font-semibold text-fg">Open Anyway</strong>, once for each new version.
        </>
      ),
      picture: <OpenPicture notarized={notarized} />,
    },
    {
      title: "Share your screen",
      body: "When a request arrives, choose Accept & share, then pick the whole display in the macOS picker. The first time, macOS may ask you to allow Screen Recording.",
      picture: <SharePicture />,
    },
    {
      title: "Allow control",
      body: (
        <>
          So the person helping you can use the mouse and keyboard, turn ASDesk on under{" "}
          <strong className="font-semibold text-fg">Accessibility</strong> in Privacy &amp; Security. ASDesk asks the
          first time it is needed.
        </>
      ),
      picture: <ControlPicture />,
    },
  ];

  return (
    <section id="mac" aria-labelledby="mac-title" className="relative overflow-hidden py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
      <Container className="relative">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <SectionHeading
            id="mac-title"
            eyebrow="New · ASDesk for Mac"
            title="Your Mac, ready in four steps."
            lede="The same ASDesk, made for macOS 13 and later: help a PC from your Mac, or let someone help your Mac. It lives in the menu bar and asks macOS for two permissions, only when it needs them."
          />
          <div className="flex flex-col gap-3 lg:items-end">
            {mac ? (
              <a href={mac.url} className={buttonClass({ className: "h-14 gap-4 px-5" })}>
                <MacIcon className="size-5" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[15px]">Download for macOS</span>
                  <span className="text-xs font-medium text-white/80">
                    {[`v${mac.version}`, "Apple silicon & Intel", mac.size > 0 && formatSize(mac.size)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <DownloadIcon className="size-5" />
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={buttonClass({ variant: "secondary", className: cx("h-14 gap-3 px-5 opacity-70", isLoading && "invisible") })}
              >
                <MacIcon className="size-5" />
                The Mac download is almost ready
              </span>
            )}
            {windows && (
              <a href={windows.url} className={cx("inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted hover:text-fg", focusRing)}>
                <WindowsIcon className="size-3.5" />
                Also for Windows 10 &amp; 11
              </a>
            )}
          </div>
        </div>

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="grid h-56 place-items-center border-b border-line bg-canvas/60 bg-grid px-5" aria-hidden="true">
                {step.picture}
              </div>
              <div className="p-6">
                <span className="font-display text-sm font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul className="mt-8 grid gap-4 rounded-2xl border border-line bg-surface/70 p-5 text-sm text-muted backdrop-blur sm:grid-cols-3 sm:p-6">
          <li className="flex items-start gap-3">
            <KeyboardIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>
              <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-xs text-fg">⌃ ⌥ ⇧ F12</kbd> stops sharing
              instantly, even while your keyboard and mouse are blocked.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <PowerIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>End every session from the ASDesk icon in the menu bar. Locking or sleeping your Mac ends it too.</span>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>Nothing starts without your yes, and you choose exactly which screen to share.</span>
          </li>
        </ul>
      </Container>
    </section>
  );
}
