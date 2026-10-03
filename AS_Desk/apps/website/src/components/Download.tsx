import { useState, type ReactNode } from "react";
import type { Installer } from "../api";
import { useDownload } from "../hooks";
import { ArrowRightIcon, CheckIcon, ClipboardIcon, DownloadIcon, MacIcon, WindowsIcon } from "./icons";
import { buttonClass, cx, focusRing } from "./ui";

export const formatSize = (bytes: number) => {
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

const editionLabel = (installer: Installer) =>
  installer.edition === "macos"
    ? "macOS 13 or later"
    : installer.edition === "standard"
      ? "Windows 10 & 11"
      : `Windows 7 & 8 · ${installer.arch === "x64" ? "64-bit" : "32-bit"}`;

/** A button that downloads the recommended installer directly; used outside the hero (the header). */
export function DirectDownloadLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { recommended } = useDownload();
  // Until the manifest loads, fall back to the hero's download block.
  return (
    <a href={recommended?.url ?? "#download"} className={className}>
      {children}
    </a>
  );
}

const inlineLink = cx(
  "rounded-sm font-semibold text-fg underline hover:text-accent hover:underline",
  focusRing,
);

/** Windows 7, 8 and 32-bit installers, or the 10/11 one for a visitor who was offered a legacy one. */
function OtherWindows({ shown }: { shown: Installer }) {
  const { find } = useDownload();
  const standard = find("standard", "x64");
  const legacy = [find("legacy", "x64"), find("legacy", "x86")].filter(
    (installer) => installer !== undefined,
  );
  if (shown.edition === "legacy")
    return standard ? (
      <p>
        On Windows 10 or 11?{" "}
        <a href={standard.url} className={inlineLink}>
          Get the {standard.size ? `${formatSize(standard.size)} ` : ""}installer
        </a>
      </p>
    ) : null;
  return legacy.length ? (
    <p>
      Windows 7, 8 or 32-bit?{" "}
      {legacy.map((installer, index) => (
        <span key={installer.url}>
          {index > 0 && " · "}
          <a href={installer.url} className={inlineLink}>
            {installer.arch === "x64" ? "64-bit" : "32-bit"}
          </a>{" "}
          {installer.size > 0 && <span className="text-subtle">({formatSize(installer.size)})</span>}
        </span>
      ))}
    </p>
  ) : null;
}

/** One installer's SHA-256 and how to check it on its own system. */
function Checksum({ installer }: { installer: Installer }) {
  const [copied, setCopied] = useState(false);
  const file = installer.url.split("/").pop();
  const copy = () =>
    navigator.clipboard
      .writeText(installer.sha256!)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-xs">
      <p className="text-muted">
        SHA-256 of <span className="font-medium text-fg">{file}</span>
      </p>
      <div className="mt-1.5 flex items-start gap-2">
        <code className="min-w-0 flex-1 font-mono break-all text-fg select-all">{installer.sha256}</code>
        <button type="button" onClick={copy} aria-label={`Copy the checksum of ${file}`} title="Copy" className={cx("shrink-0 rounded p-1 text-subtle hover:bg-raised hover:text-fg", focusRing)}>
          {copied ? <CheckIcon className="size-3.5" /> : <ClipboardIcon className="size-3.5" />}
        </button>
      </div>
      <p className="mt-2 text-subtle">
        {installer.edition === "macos" ? (
          <>
            Check it in Terminal: <code className="font-mono text-fg">shasum -a 256 ~/Downloads/{file}</code>
          </>
        ) : (
          <>
            Check it in PowerShell: <code className="font-mono text-fg">Get-FileHash .\{file}</code>
          </>
        )}
      </p>
    </div>
  );
}

/** The checksums of the installers offered, so anyone can check that a file is the one published here. */
function Checksums({ installers }: { installers: Installer[] }) {
  const listed = installers.filter((installer) => installer.sha256);
  if (!listed.length) return null;
  return (
    <details className="group text-subtle">
      <summary className={cx("inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm hover:text-fg [&::-webkit-details-marker]:hidden", focusRing)}>
        Verify a download <span className="text-xs transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 grid max-w-xl gap-2">
        {listed.map((installer) => (
          <Checksum key={installer.url} installer={installer} />
        ))}
      </div>
    </details>
  );
}

/**
 * One system's download button. Both are built the same way; the visitor's own system gets the filled
 * style and comes first, so there is one obvious choice and the other is still one click away. A button
 * whose installer is not available (still loading, or a Mac build not published yet) says why and is inert.
 */
function PlatformButton({
  system,
  installer,
  primary,
  unavailable,
}: {
  system: "windows" | "macos";
  installer?: Installer;
  primary: boolean;
  unavailable: string;
}) {
  const Icon = system === "macos" ? MacIcon : WindowsIcon;
  const details = installer
    ? [editionLabel(installer), installer.size > 0 && formatSize(installer.size)].filter(Boolean).join(" · ")
    : unavailable;
  const content = (
    <>
      <Icon className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
        <span className="text-[15px]">Download for {system === "macos" ? "macOS" : "Windows"}</span>
        <span className={cx("max-w-full truncate text-xs font-medium", primary && installer ? "text-white/80" : "text-subtle")}>
          {details}
        </span>
      </span>
      <DownloadIcon className="size-5 shrink-0" />
    </>
  );
  const shape = "h-14 w-full justify-between gap-3 px-4";
  if (!installer)
    return (
      <span aria-disabled="true" className={buttonClass({ variant: "secondary", className: cx(shape, "pointer-events-none opacity-60") })}>
        {content}
      </span>
    );
  return (
    <a href={installer.url} className={buttonClass({ variant: primary ? "primary" : "secondary", className: shape })}>
      {content}
    </a>
  );
}

/** The primary call to action: Windows and macOS side by side, this visitor's own system first. */
export function HeroDownload() {
  const { recommended, find, platform, isLoading, isError } = useDownload();
  const onMac = platform.edition === "macos";
  // A Windows visitor's installer may be the legacy one (Windows 7/8, 32-bit); on a Mac, the Windows
  // button offers the standard installer.
  const windows = onMac ? find("standard", "x64") : recommended;
  const mac = find("macos", "universal");
  const macFirst = onMac && !!mac;
  const pending = isLoading ? "Finding the latest version…" : isError ? "Unavailable right now" : undefined;
  const buttons = [
    <PlatformButton key="windows" system="windows" installer={windows} primary={!macFirst} unavailable={pending ?? "Unavailable right now"} />,
    <PlatformButton key="macos" system="macos" installer={mac} primary={macFirst} unavailable={pending ?? "Coming soon"} />,
  ];
  if (macFirst) buttons.reverse();
  const offered = [windows, mac].filter((installer) => installer !== undefined);
  const versions = [...new Set(offered.map((installer) => installer.version))];

  return (
    <div id="download" className="mt-9 scroll-mt-28">
      <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">{buttons}</div>

      <div className="mt-4 space-y-2 text-sm text-muted">
        {isError && (
          <p role="alert" className="text-subtle">
            Couldn't load the latest release — refresh to try again.
          </p>
        )}
        {windows && <OtherWindows shown={windows} />}
        <Checksums installers={offered} />
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-subtle">
          <span aria-live="polite">{[versions.length === 1 && `Version ${versions[0]}`, "Free, no sign-up"].filter(Boolean).join(" · ")}</span>
          <a
            href="#how-it-works"
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md font-semibold text-fg hover:text-accent",
              focusRing,
            )}
          >
            See how it works <ArrowRightIcon />
          </a>
        </p>
      </div>
    </div>
  );
}
