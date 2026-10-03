import type { ComponentType, ReactNode, SVGProps } from "react";
import type { Installer } from "../api";
import { useDownload } from "../hooks";
import { formatSize } from "./Download";
import { ArrowRightIcon, CheckIcon, DownloadIcon, MacIcon, SwapIcon, WindowsIcon } from "./icons";
import { Container, SectionHeading, buttonClass, cx, focusRing } from "./ui";

const inlineLink = cx("rounded-sm font-semibold text-fg underline hover:text-accent", focusRing);

function PlatformCard({
  icon: Icon,
  name,
  needs,
  points,
  installer,
  label,
  current,
  pending,
  extra,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  needs: string;
  points: string[];
  installer?: Installer;
  label: string;
  current: boolean;
  pending: boolean;
  extra?: ReactNode;
}) {
  return (
    <article
      className={cx(
        "relative flex flex-col rounded-3xl border bg-surface p-7 sm:p-9",
        current ? "border-accent/50 shadow-xl shadow-brand-600/10 ring-1 ring-accent/30" : "border-line",
      )}
    >
      {current && (
        <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase sm:left-9">
          For this computer
        </span>
      )}
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <Icon className="size-6" />
        </span>
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight">{name}</h3>
          <p className="text-sm text-subtle">{needs}</p>
        </div>
      </div>
      <ul className="mt-7 grid gap-3 text-sm">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
            <span className="text-muted">{point}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        {installer ? (
          <a href={installer.url} className={buttonClass({ variant: current ? "primary" : "secondary", className: "w-full" })}>
            {label} <DownloadIcon />
          </a>
        ) : (
          <span aria-disabled="true" className={buttonClass({ variant: "secondary", className: cx("w-full opacity-60", pending && "invisible") })}>
            Coming soon
          </span>
        )}
        <p className="mt-3 min-h-5 text-center text-xs text-subtle">
          {installer && [`Version ${installer.version}`, installer.size > 0 && formatSize(installer.size)].filter(Boolean).join(" · ")}
        </p>
        {extra && <div className="mt-4 border-t border-line pt-4 text-sm text-muted">{extra}</div>}
      </div>
    </article>
  );
}

/** Both systems side by side, whichever one this visitor is on. */
export function Platforms() {
  const { find, platform, isLoading } = useDownload();
  const legacy = [find("legacy", "x64"), find("legacy", "x86")].filter((installer) => installer !== undefined);
  const mac = find("macos", "universal");
  const onMac = platform.edition === "macos";

  return (
    <section id="downloads" aria-labelledby="downloads-title" className="border-t border-line bg-surface/40 py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="downloads-title"
          eyebrow="Download"
          title="One app. Windows and Mac."
          lede="Install it on any mix of computers: a Mac can help a PC, a PC can help a Mac, and every feature is in both."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <PlatformCard
            icon={WindowsIcon}
            name="Windows"
            needs="Windows 10 and 11, 64-bit"
            points={["A couple of megabytes; uses the WebView2 built into Windows", "Control reaches admin (UAC) prompts and elevated apps too", "Unattended access with a password, if you turn it on"]}
            installer={find("standard", "x64")}
            label="Download for Windows"
            current={!onMac}
            pending={isLoading}
            extra={
              legacy.length > 0 && (
                <>
                  Windows 7, 8 or 32-bit?{" "}
                  {legacy.map((installer, index) => (
                    <span key={installer.url}>
                      {index > 0 && " · "}
                      <a href={installer.url} className={inlineLink}>
                        {installer.arch === "x64" ? "64-bit" : "32-bit"}
                      </a>
                    </span>
                  ))}
                </>
              )
            }
          />
          <PlatformCard
            icon={MacIcon}
            name="macOS"
            needs="macOS 13 Ventura or later"
            points={["One universal app for Apple silicon and Intel Macs", "Lives in the menu bar, with native window controls", "Asks for Screen Recording and Accessibility only when needed"]}
            installer={mac}
            label="Download for macOS"
            current={onMac}
            pending={isLoading}
            extra={
              <a href="#mac" className={cx("inline-flex items-center gap-1.5 rounded-md font-semibold text-fg hover:text-accent", focusRing)}>
                See the four setup steps <ArrowRightIcon className="size-3.5" />
              </a>
            }
          />
        </div>

        <p className="mt-8 flex items-center justify-center gap-2.5 text-center text-sm text-muted">
          <SwapIcon className="size-4 shrink-0 text-accent" />
          Same nine-digit ID, same approval prompt and the same encryption, whichever computer is on either end.
        </p>
      </Container>
    </section>
  );
}
