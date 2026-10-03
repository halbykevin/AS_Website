import { useState, type ReactNode } from "react";
import type { Installer } from "../api";
import { useDownload } from "../hooks";
import { ArrowRightIcon, CheckIcon, ClipboardIcon, DownloadIcon, LaptopIcon, WindowsIcon } from "./icons";
import { buttonClass, cx, focusRing } from "./ui";

const formatSize = (bytes: number) => {
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

const editionLabel = (installer: Installer) =>
  installer.edition === "macos"
    ? "macOS 13 or later"
    : installer.edition === "standard"
      ? "Windows 10 & 11"
      : `Windows 7 & 8 · ${installer.arch === "x64" ? "64-bit" : "32-bit"}`;

/** A button that downloads the recommended installer directly; used outside the hero (header, pricing). */
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

/** The other installers, as quiet lines under the main button. */
function OtherVersions({ recommended }: { recommended: Installer }) {
  const { find } = useDownload();
  const standard = find("standard", "x64");
  const mac = find("macos", "universal");
  const legacy = [find("legacy", "x64"), find("legacy", "x86")].filter(
    (installer) => installer !== undefined,
  );

  return (
    <>
      {recommended.edition !== "standard" && standard && (
        <p>
          On Windows 10 or 11?{" "}
          <a href={standard.url} className={inlineLink}>
            Get the {standard.size ? `${formatSize(standard.size)} ` : ""}installer
          </a>
        </p>
      )}
      {recommended.edition === "standard" && legacy.length > 0 && (
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
      )}
      {recommended.edition !== "macos" && mac && (
        <p>
          On a Mac?{" "}
          <a href={mac.url} className={inlineLink}>
            Download for macOS
          </a>{" "}
          {mac.size > 0 && <span className="text-subtle">({formatSize(mac.size)})</span>}
        </p>
      )}
    </>
  );
}

/** The installer's SHA-256, so anyone can check the file they got is the one published here. */
function Checksum({ installer }: { installer: Installer }) {
  const [copied, setCopied] = useState(false);
  if (!installer.sha256) return null;
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
    <details className="group text-subtle">
      <summary className={cx("inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm hover:text-fg [&::-webkit-details-marker]:hidden", focusRing)}>
        Verify this download <span className="text-xs transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 max-w-md rounded-lg border border-line bg-surface p-3 text-xs">
        <p className="text-muted">
          SHA-256 of <span className="font-medium text-fg">{file}</span>
        </p>
        <div className="mt-1.5 flex items-start gap-2">
          <code className="min-w-0 flex-1 font-mono break-all text-fg select-all">{installer.sha256}</code>
          <button type="button" onClick={copy} aria-label="Copy checksum" title="Copy" className={cx("shrink-0 rounded p-1 text-subtle hover:bg-raised hover:text-fg", focusRing)}>
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
    </details>
  );
}

/** The primary call to action: the right installer for this visitor, straight from the hero. */
export function HeroDownload() {
  const { recommended, platform, isLoading, isError } = useDownload();
  // Until the release list loads, this visitor's own system; then whatever is actually offered.
  const mac = (recommended?.edition ?? platform.edition) === "macos";
  const SystemIcon = mac ? LaptopIcon : WindowsIcon;

  const details = isError
    ? "Couldn't load the latest release — refresh to try again"
    : isLoading || !recommended
      ? "Finding the latest version…"
      : [`v${recommended.version}`, editionLabel(recommended), recommended.size > 0 && formatSize(recommended.size)].filter(Boolean).join(" · ");

  return (
    <div id="download" className="mt-9 scroll-mt-28">
      <a
        href={recommended?.url}
        aria-disabled={!recommended}
        aria-describedby="download-status"
        className={buttonClass({
          className: cx(
            "h-14 w-full justify-between gap-4 px-5 sm:w-auto sm:min-w-80",
            !recommended && "pointer-events-none opacity-60",
          ),
        })}
      >
        <SystemIcon className="size-5 shrink-0" />
        <span className="flex flex-1 flex-col items-start leading-tight">
          <span className="text-[15px]">Download for {mac ? "macOS" : "Windows"}</span>
          <span
            id="download-status"
            className="text-xs font-medium text-white/80"
            aria-live="polite"
          >
            {details}
          </span>
        </span>
        <DownloadIcon className="size-5 shrink-0" />
      </a>

      <div className="mt-4 space-y-2 text-sm text-muted">
        {recommended && <OtherVersions recommended={recommended} />}
        {recommended && <Checksum installer={recommended} />}
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-subtle">
          <span>Free, no sign-up</span>
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
