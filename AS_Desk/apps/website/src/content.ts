import type { ComponentType, SVGProps } from "react";
import {
  BriefcaseIcon,
  ClipboardIcon,
  HeartIcon,
  LockIcon,
  PowerIcon,
  RouteIcon,
  ShieldCheckIcon,
  TabsIcon,
  WrenchIcon,
} from "./components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#free", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export const heroHighlights = ["No account", "No time limits", "End-to-end encrypted"];

export const features: Array<{ icon: Icon; title: string; body: string }> = [
  {
    icon: ShieldCheckIcon,
    title: "Nothing starts without a yes",
    body: "The person at the other computer sees who is asking and exactly which permissions, then chooses to accept or decline.",
  },
  {
    icon: LockIcon,
    title: "Encrypted end to end",
    body: "Screen, mouse, keyboard and clipboard travel over encrypted WebRTC channels. Even when relayed, the relay only forwards ciphertext.",
  },
  {
    icon: RouteIcon,
    title: "Direct when possible",
    body: "Computers connect peer to peer for the lowest latency, and fall back to a relay automatically on strict or corporate networks.",
  },
  {
    icon: TabsIcon,
    title: "Several computers at once",
    body: "Open each remote screen in its own tab or see them side by side in a grid. Fit to window, 1:1 pixels, or full screen.",
  },
  {
    icon: ClipboardIcon,
    title: "Copy and paste across",
    body: "Copy text on one computer and paste it on the other. Copy files too, and paste them straight into the remote computer.",
  },
  {
    icon: PowerIcon,
    title: "Stop in one keystroke",
    body: "A small panel shows while sharing. Ctrl + Alt + Shift + F12 (Control + Option + Shift + F12 on a Mac) ends it instantly, and locking or sleeping the computer ends it too.",
  },
];

export const audiences: Array<{ icon: Icon; title: string; body: string }> = [
  {
    icon: HeartIcon,
    title: "Family and friends",
    body: "Fix a printer, install an update, or walk someone through a setting without a two-hour phone call.",
  },
  {
    icon: BriefcaseIcon,
    title: "Freelancers and small teams",
    body: "Review a colleague's screen or support a client without per-seat licenses or a monthly bill.",
  },
  {
    icon: WrenchIcon,
    title: "IT and help desks",
    body: "Attended support that users understand: a visible request, clear permissions, and a stop button they control.",
  },
];

export const steps = [
  { title: "Install on both computers", body: "Run the installer on each Windows PC or Mac. There is no account to create and nothing to configure." },
  { title: "Share the nine-digit ID", body: "Each computer gets a permanent ID. Read yours out, and the helper types it in and chooses Connect." },
  { title: "Approve and connect", body: "Accept the request, pick what to share, and disconnect whenever you are done." },
];

export const freePerks = [
  "Every feature included",
  "No account or email",
  "No session time limits",
  "No ads or upsells",
  "Personal and work use",
  "Unlimited devices",
];

export const faqs = [
  {
    question: "Is ASDesk really free?",
    answer:
      "Yes. There is no trial, no paid plan and no feature held back. Download it, install it on as many computers as you like, and use it for personal or work support.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No. On first launch the app registers the computer on its own and shows a permanent nine-digit ID. That ID is all anyone needs to send you a request.",
  },
  {
    question: "Can someone connect to my computer without my permission?",
    answer:
      "No. ASDesk is attended remote desktop: every session needs the person at that computer to accept it, and they see who is asking and which permissions first. Only accept requests from people you know, and never because an unexpected caller asks you to.",
  },
  {
    question: "Is my session private?",
    answer:
      "The screen stream and input are encrypted end to end between the two computers. When a direct connection is not possible, traffic goes through a relay that only forwards encrypted packets and cannot see your screen.",
  },
  {
    question: "Which computers does ASDesk run on?",
    answer:
      "Windows 10 and 11 (64-bit) use the standard installer, just a couple of megabytes, which relies on the WebView2 runtime built into Windows and installs it automatically if it is missing. For Windows 7 SP1, 8, 8.1 or 32-bit Windows, use the legacy installer: it bundles its own runtime, which is why it is much larger. Macs need macOS 13 Ventura or later, Apple silicon or Intel, with one download for both. The first time a Mac shares its screen, macOS asks to allow Screen Recording, and Accessibility before it can be controlled; both are in System Settings, under Privacy & Security.",
  },
  {
    question: "Why does my browser or computer warn about the download?",
    answer:
      "ASDesk is new and its installer is not code-signed yet, so Chrome, Edge and Windows SmartScreen treat it as an unfamiliar file until it has a download history. Before keeping it, check that it came from this site and that its SHA-256 checksum matches the one shown under the download button (in PowerShell: Get-FileHash, then the file name). If it matches, choose Keep in the browser's downloads list, and More info, then Run anyway, if SmartScreen asks. On a Mac, check the checksum in Terminal with shasum -a 256; if macOS then says it cannot verify ASDesk, open System Settings, Privacy & Security, and choose Open Anyway.",
  },
];
