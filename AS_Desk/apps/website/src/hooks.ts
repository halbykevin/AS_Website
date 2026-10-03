import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { compareVersions, fetchLatest, fetchReleaseManifest, type Architecture, type Edition, type Installer } from "./api";
import { detectPlatform } from "./platform";
import type { AppDispatch, RootState } from "./store";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

const THEME_KEY = "asdesk-theme";

/** Mirrors the Redux theme onto <html> and remembers it for the next visit. */
export function useThemeSync() {
  const theme = useAppSelector((state) => state.theme.value);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#07111f" : "#f6f7f9");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the theme still applies.
    }
  }, [theme]);
}

/** The release manifest, and the installer recommended for this visitor (shared by every download button). */
export function useDownload() {
  const releases = useQuery({ queryKey: ["release-manifest"], queryFn: fetchReleaseManifest });
  // The download server knows about a Windows or macOS release as soon as it is published; the manifest
  // only after the site is redeployed. Prefer whichever is newer, and fall back to the manifest on any error.
  const listed = releases.data?.latest.installers ?? [];
  const listedStandard = listed.find((installer) => installer.edition === "standard");
  const downloadsBase = listedStandard?.url.slice(0, listedStandard.url.lastIndexOf("/"));
  const live = useQuery({
    queryKey: ["latest-installers", downloadsBase],
    queryFn: () => Promise.all([fetchLatest("standard", downloadsBase!), fetchLatest("macos", downloadsBase!)]),
    enabled: !!downloadsBase,
    retry: false,
  });
  const fetched: (Installer | undefined)[] = live.data ?? [];
  const newer = fetched.filter((installer): installer is Installer => {
    const current = installer && listed.find((item) => item.edition === installer.edition);
    return !!installer && (!current || compareVersions(installer.version, current.version) > 0);
  });
  const installers: Installer[] = [...newer, ...listed.filter((installer) => !newer.some((item) => item.edition === installer.edition))];
  const find = (edition: Edition, arch: Architecture) =>
    installers.find((installer) => installer.edition === edition && installer.arch === arch);
  const platform = detectPlatform();
  return {
    installers,
    find,
    platform,
    recommended: find(platform.edition, platform.arch) ?? find("standard", "x64"),
    isLoading: releases.isPending,
    isError: releases.isError,
  };
}
