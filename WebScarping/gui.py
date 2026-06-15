#!/usr/bin/env python3
"""Desktop GUI for the e-commerce scraper.

Run with:  python gui.py     (or double-click run_gui.bat)

Paste a product URL (or a category page URL), pick your options, and click
"Start scraping". Progress shows in the log box; results land in the output
folder, which you can open with one click.
"""

from __future__ import annotations

import os
import sys
import queue
import threading
import contextlib
import webbrowser
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Windows consoles default to cp1252, which crashes on the non-ASCII characters
# common in product names and error messages. Make all stdout/stderr UTF-8-safe.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from ecom_scraper import extract, runner
from ecom_scraper.export import export
from ecom_scraper.fetch import Fetcher


class _LogWriter:
    """A file-like object that forwards everything written to the GUI log."""

    def __init__(self, log_fn):
        self._log = log_fn
        self._buf = ""

    def write(self, text):
        self._buf += text
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if line.strip():
                self._log(line.rstrip())

    def flush(self):
        if self._buf.strip():
            self._log(self._buf.rstrip())
            self._buf = ""


class ScraperGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.log_queue: queue.Queue[str] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.last_output_dir = os.path.abspath("output")

        root.title("E-commerce Scraper")
        root.minsize(640, 560)

        self._build_widgets()
        self._poll_log()

    # ------------------------------------------------------------------ UI
    def _build_widgets(self):
        pad = {"padx": 10, "pady": 4}
        frm = ttk.Frame(self.root, padding=12)
        frm.pack(fill="both", expand=True)
        frm.columnconfigure(0, weight=1)

        # URL input
        ttk.Label(frm, text="Product or category page URL:").grid(
            row=0, column=0, sticky="w", **pad)
        self.url_var = tk.StringVar()
        url_entry = ttk.Entry(frm, textvariable=self.url_var)
        url_entry.grid(row=1, column=0, sticky="ew", padx=10)
        url_entry.focus()

        # Mode
        self.mode_var = tk.StringVar(value="auto")
        mode_frm = ttk.LabelFrame(frm, text="Mode", padding=8)
        mode_frm.grid(row=2, column=0, sticky="ew", **pad)
        ttk.Radiobutton(mode_frm, text="Auto-detect (recommended)",
                        variable=self.mode_var, value="auto").pack(side="left", padx=6)
        ttk.Radiobutton(mode_frm, text="Single product",
                        variable=self.mode_var, value="single").pack(side="left", padx=6)
        ttk.Radiobutton(mode_frm, text="Crawl category page",
                        variable=self.mode_var, value="crawl").pack(side="left", padx=6)

        # Options
        opt_frm = ttk.LabelFrame(frm, text="Options", padding=8)
        opt_frm.grid(row=3, column=0, sticky="ew", **pad)
        self.render_var = tk.BooleanVar(value=False)

        # Images: links-only vs. download files. (URLs are always in the export.)
        ttk.Label(opt_frm, text="Images:").grid(row=0, column=0, sticky="w", padx=6)
        self.images_var = tk.StringVar(value="links")
        img_box = ttk.Frame(opt_frm)
        img_box.grid(row=0, column=1, sticky="w")
        ttk.Radiobutton(img_box, text="Links only (in export)",
                        variable=self.images_var, value="links").pack(side="left", padx=4)
        ttk.Radiobutton(img_box, text="Download image files",
                        variable=self.images_var, value="download").pack(side="left", padx=4)

        ttk.Checkbutton(opt_frm, text="JavaScript site (slower, needs Playwright)",
                        variable=self.render_var).grid(row=4, column=0, columnspan=2,
                                                       sticky="w", padx=6, pady=(8, 0))

        self.ignore_robots_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt_frm, text="Ignore robots.txt (only if you have permission)",
                        variable=self.ignore_robots_var).grid(row=6, column=0, columnspan=2,
                                                              sticky="w", padx=6, pady=(2, 0))

        ttk.Label(opt_frm, text="Export:").grid(row=1, column=0, sticky="w", padx=6, pady=(8, 0))
        self.fmt_json = tk.BooleanVar(value=True)
        self.fmt_csv = tk.BooleanVar(value=True)
        self.fmt_xlsx = tk.BooleanVar(value=True)
        self.fmt_html = tk.BooleanVar(value=True)
        fmt_box = ttk.Frame(opt_frm)
        fmt_box.grid(row=1, column=1, sticky="w", pady=(8, 0))
        ttk.Checkbutton(fmt_box, text="JSON", variable=self.fmt_json).pack(side="left", padx=4)
        ttk.Checkbutton(fmt_box, text="CSV", variable=self.fmt_csv).pack(side="left", padx=4)
        ttk.Checkbutton(fmt_box, text="Excel", variable=self.fmt_xlsx).pack(side="left", padx=4)
        ttk.Checkbutton(fmt_box, text="HTML page", variable=self.fmt_html).pack(side="left", padx=4)

        ttk.Label(opt_frm, text="Max products (crawl):").grid(
            row=2, column=0, sticky="w", padx=6, pady=(8, 0))
        self.limit_var = tk.StringVar(value="0")
        limit_box = ttk.Frame(opt_frm)
        limit_box.grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Spinbox(limit_box, from_=0, to=100000, textvariable=self.limit_var,
                    width=8).pack(side="left")
        ttk.Label(limit_box, text="(0 = no limit)").pack(side="left", padx=6)

        self.allpages_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt_frm, text="Follow \"Next\" through all pages",
                        variable=self.allpages_var).grid(
            row=3, column=0, columnspan=2, sticky="w", padx=6, pady=(8, 0))

        ttk.Label(opt_frm, text="Speed (parallel fetches):").grid(
            row=5, column=0, sticky="w", padx=6, pady=(8, 0))
        speed_box = ttk.Frame(opt_frm)
        speed_box.grid(row=5, column=1, sticky="w", pady=(8, 0))
        self.workers_var = tk.StringVar(value="8")
        ttk.Spinbox(speed_box, from_=1, to=32, textvariable=self.workers_var,
                    width=6).pack(side="left")
        ttk.Label(speed_box, text="  Delay (s):").pack(side="left")
        self.delay_var = tk.StringVar(value="0.2")
        ttk.Spinbox(speed_box, from_=0, to=60, increment=0.1, textvariable=self.delay_var,
                    width=6).pack(side="left", padx=4)

        # Output folder
        out_frm = ttk.Frame(frm)
        out_frm.grid(row=4, column=0, sticky="ew", **pad)
        out_frm.columnconfigure(1, weight=1)
        ttk.Label(out_frm, text="Output folder:").grid(row=0, column=0, sticky="w")
        self.out_var = tk.StringVar(value="output")
        ttk.Entry(out_frm, textvariable=self.out_var).grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(out_frm, text="Browse…", command=self._browse).grid(row=0, column=2)

        # Buttons
        btn_frm = ttk.Frame(frm)
        btn_frm.grid(row=5, column=0, sticky="ew", **pad)
        self.start_btn = ttk.Button(btn_frm, text="▶  Start scraping", command=self._start)
        self.start_btn.pack(side="left")
        ttk.Button(btn_frm, text="Open output folder",
                   command=self._open_output).pack(side="left", padx=8)

        # Progress bar
        prog_frm = ttk.Frame(frm)
        prog_frm.grid(row=6, column=0, sticky="ew", padx=10)
        prog_frm.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(prog_frm, mode="determinate", maximum=100)
        self.progress.grid(row=0, column=0, sticky="ew")
        self.progress_lbl = ttk.Label(prog_frm, text="", width=12, anchor="e")
        self.progress_lbl.grid(row=0, column=1, padx=(8, 0))

        # Log
        ttk.Label(frm, text="Log:").grid(row=7, column=0, sticky="w", padx=10)
        log_frm = ttk.Frame(frm)
        log_frm.grid(row=8, column=0, sticky="nsew", padx=10, pady=(0, 10))
        frm.rowconfigure(8, weight=1)
        log_frm.columnconfigure(0, weight=1)
        log_frm.rowconfigure(0, weight=1)
        self.log = tk.Text(log_frm, height=12, wrap="word", state="disabled",
                           bg="#1e1e1e", fg="#d4d4d4", insertbackground="#d4d4d4")
        self.log.grid(row=0, column=0, sticky="nsew")
        sb = ttk.Scrollbar(log_frm, command=self.log.yview)
        sb.grid(row=0, column=1, sticky="ns")
        self.log["yscrollcommand"] = sb.set

        self.status = ttk.Label(frm, text="Ready.", anchor="w")
        self.status.grid(row=9, column=0, sticky="ew", padx=10, pady=(0, 6))

    # -------------------------------------------------------------- helpers
    def _browse(self):
        d = filedialog.askdirectory(initialdir=os.path.abspath(self.out_var.get() or "."))
        if d:
            self.out_var.set(d)

    def _open_output(self):
        path = self.last_output_dir
        if os.path.isdir(path):
            webbrowser.open(path)
        else:
            messagebox.showinfo("Not found", "No output folder yet — run a scrape first.")

    def _log(self, msg: str):
        self.log_queue.put(msg)

    def _poll_log(self):
        while not self.log_queue.empty():
            msg = self.log_queue.get_nowait()
            self.log["state"] = "normal"
            self.log.insert("end", msg + "\n")
            self.log.see("end")
            self.log["state"] = "disabled"
        self.root.after(120, self._poll_log)

    def _set_running(self, running: bool):
        self.start_btn["state"] = "disabled" if running else "normal"
        self.status["text"] = "Working…" if running else "Ready."

    def _set_progress(self, done: int, total: int):
        """Update the progress bar (safe to call from the worker thread)."""
        def apply():
            if total <= 0:
                self.progress["value"] = 0
                self.progress_lbl["text"] = ""
                return
            self.progress["maximum"] = total
            self.progress["value"] = done
            self.progress_lbl["text"] = f"{done} / {total}"
        self.root.after(0, apply)

    # ---------------------------------------------------------------- start
    def _start(self):
        url = self.url_var.get().strip()
        if not url:
            messagebox.showwarning("Missing URL", "Please paste a URL first.")
            return
        if not url.startswith("http"):
            url = "https://" + url
        formats = [f for f, v in (("json", self.fmt_json), ("csv", self.fmt_csv),
                                  ("xlsx", self.fmt_xlsx), ("html", self.fmt_html)) if v.get()]
        if not formats:
            messagebox.showwarning("No format", "Pick at least one export format.")
            return
        try:
            delay = float(self.delay_var.get() or 0.2)
            limit = int(self.limit_var.get() or 0)
            workers = max(1, int(self.workers_var.get() or 1))
        except ValueError:
            messagebox.showwarning("Bad number", "Delay/limit/speed must be numbers.")
            return

        opts = dict(
            url=url,
            mode=self.mode_var.get(),
            download_images=self.images_var.get() == "download",
            render=self.render_var.get(),
            formats=formats,
            delay=delay,
            limit=limit,
            workers=workers,
            all_pages=self.allpages_var.get(),
            ignore_robots=self.ignore_robots_var.get(),
            out=self.out_var.get().strip() or "output",
        )
        self._set_running(True)
        self._set_progress(0, 0)
        self.log["state"] = "normal"; self.log.delete("1.0", "end"); self.log["state"] = "disabled"
        self.worker = threading.Thread(target=self._run, args=(opts,), daemon=True)
        self.worker.start()

    # ------------------------------------------------------------ the work
    def _run(self, o: dict):
        # Route the scraper library's print() output into the log box, so it
        # never touches the (cp1252) console and the user sees progress/warnings.
        with contextlib.redirect_stdout(_LogWriter(self._log)), \
                contextlib.redirect_stderr(_LogWriter(self._log)):
            self._do_run(o)

    def _do_run(self, o: dict):
        try:
            fetcher = Fetcher(render=o["render"], delay=o["delay"],
                              respect_robots=not o["ignore_robots"])
            try:
                mode = o["mode"]
                if mode == "single":
                    urls = [o["url"]]
                elif mode == "crawl":
                    self._log(f"Crawling for product links: {o['url']}")
                    urls = runner.collect_product_urls(
                        fetcher, o["url"], follow_pagination=o["all_pages"], log=self._log)
                else:  # auto-detect
                    self._log(f"Checking page: {o['url']}")
                    html = fetcher.get(o["url"])
                    probe = extract.parse(html or "", o["url"], None) if html else None
                    if probe and probe.price is not None:
                        self._log("  looks like a single product page.")
                        urls = [o["url"]]
                    elif extract.find_product_links(html or "", o["url"], None):
                        self._log("  looks like a category page — collecting products…")
                        urls = runner.collect_product_urls(
                            fetcher, o["url"], follow_pagination=o["all_pages"], log=self._log)
                    else:
                        self._log("  treating as a single page.")
                        urls = [o["url"]]
                if o["limit"]:
                    urls = urls[: o["limit"]]
                if not urls:
                    self._log("No product URLs found.")
                    return

                workers = o["workers"]
                self._log(f"\nScraping {len(urls)} product(s) "
                          f"with {workers} parallel fetch(es)…")
                products = runner.scrape_products(
                    fetcher, urls, o["download_images"], o["out"], workers, self._log,
                    progress=self._set_progress)
            finally:
                fetcher.close()

            if not products:
                self._log("\nNo products extracted.")
                return
            files = export(products, o["out"], "products", o["formats"])
            self.last_output_dir = os.path.abspath(o["out"])
            self._log(f"\n✔ Done — {len(products)} product(s) scraped.")
            for f in files:
                self._log(f"  wrote {f}")
            if o["download_images"]:
                self._log(f"  images saved in {os.path.join(o['out'], 'images')}")
            else:
                self._log("  image links are in the 'images' column of the export.")
            self._log("\nClick \"Open output folder\" to see the files.")
        except Exception as exc:
            self._log(f"\n✖ Error: {exc}")
        finally:
            self.root.after(0, lambda: self._set_running(False))


def main():
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.2)
    except tk.TclError:
        pass
    ScraperGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
