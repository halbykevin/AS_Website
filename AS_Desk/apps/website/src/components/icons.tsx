import { useId, type SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const icon = (paths: string[]) =>
  function Icon({ className = "size-4", ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };

export const ArrowRightIcon = icon(["M5 12h14", "m13 6 6 6-6 6"]);
export const DownloadIcon = icon(["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"]);
export const SunIcon = icon([
  "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41",
]);
export const MoonIcon = icon(["M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"]);
export const MenuIcon = icon(["M4 7h16", "M4 12h16", "M4 17h16"]);
export const CloseIcon = icon(["m6 6 12 12", "M18 6 6 18"]);
export const CheckIcon = icon(["m5 12.5 4.5 4.5L19 7.5"]);
export const PlusIcon = icon(["M12 5v14", "M5 12h14"]);
export const ShieldCheckIcon = icon([
  "M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z",
  "m8.8 12 2.2 2.2 4.3-4.4",
]);
export const LockIcon = icon(["M6 11h12v10H6z", "M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"]);
export const RouteIcon = icon([
  "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  "M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  "M8 17h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16",
]);
export const TabsIcon = icon(["M3 8h18v12H3z", "M3 8V5h6v3", "M9 8V5h6v3"]);
export const ClipboardIcon = icon([
  "M9 4h6v3H9z",
  "M15 5.5h2.5V21h-11V5.5H9",
  "M9.5 12h5M9.5 16h5",
]);
export const PowerIcon = icon(["M12 3v8", "M7.05 6.4a7.5 7.5 0 1 0 9.9 0"]);
export const HeartIcon = icon([
  "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z",
]);
export const BriefcaseIcon = icon(["M3.5 8h17v11h-17z", "M9 8V5.5h6V8", "M3.5 13h17"]);
export const WrenchIcon = icon([
  "M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7",
  "M14.7 6.3 17 4a4 4 0 0 1 3 3l-2.3 2.3",
]);
export const SwapIcon = icon(["M4 8h15", "m15 4 4 4-4 4", "M20 16H5", "m9 12-4 4 4 4"]);
export const KeyboardIcon = icon(["M3 6h18v12H3z", "M7 10h.01M11 10h.01M15 10h.01M7 14h10"]);
/**
 * The Mac, as the Finder's two-tone face: blue and grey halves split by a profile, two eyes and a smile.
 * Drawn here in flat colours, so it reads the same on light, dark and brand-red backgrounds.
 */
export function MacIcon({ className = "size-4", ...props }: IconProps) {
  const clip = `mac-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <defs>
        <clipPath id={clip}>
          <rect x="2.5" y="3.5" width="19" height="17" rx="4" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="2.5" y="3.5" width="19" height="17" fill="#e0e0e0" />
        <path d="M0 0H12.4L12.2 3.5C11.7 6.5 10.8 9.6 10.5 11.7L13.3 12C13.6 14.8 13.8 17.5 13.9 24H0Z" fill="#03a9f4" />
        <path d="M12.2 3.5C11.7 6.5 10.8 9.6 10.5 11.7L13.3 12C13.6 14.8 13.8 17.5 13.9 20.5" fill="none" stroke="#0288d1" strokeWidth="1.1" strokeLinejoin="round" />
      </g>
      <g fill="none" stroke="#37474f" strokeLinecap="round">
        <path d="M7.8 7.6v2" strokeWidth="1.6" />
        <path d="M16.3 7.6v2" strokeWidth="1.6" />
        <path d="M6.3 15.2q5.7 4.1 11.4 0" strokeWidth="1.4" />
      </g>
    </svg>
  );
}
export const WindowsIcon = icon(["M4 5.5 11 4.5v7H4z", "M13 4.2 20 3v8.5h-7z", "M4 13h7v6.5l-7-1z", "M13 13h7V21l-7-1.2z"]);
