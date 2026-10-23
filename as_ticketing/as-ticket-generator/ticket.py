"""
AS Ticketing - ticket generator
Event: القرنة البيضا  |  26/12/2026 6:30 PM  |  Milad Al Ghazal Center, Zgharta

Usage
  python ticket.py                    -> builds a sample ticket (sample-ticket.pdf)
  python ticket.py tickets.csv        -> one PDF per row of the CSV
                                         columns: ticket_no,name,section,row,seat
Output size: 200 x 80 mm (landscape), print-ready at 600 dpi, QR is vector.
"""
import csv, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageChops
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda f: os.path.join(HERE, "assets", f)

# ---------- event details (edit here) ----------
EVENT = dict(
    date_en="26 Dec 2026", date_ar="السبت 26 ديسمبر 2026",
    time_en="6:30 PM",     time_ar="6:30 مساءً",
    venue_ar="مسرح ميلاد الغزال – زغرتا",
    venue_en="Milad Al Ghazal Center",
    venue_sub="MGC  ·  Zgharta",
    website="ticketing.as.com.lb",
)

# ---------- geometry (mm) ----------
W_MM, H_MM = 200, 80
POSTER_W = 51          # left poster panel
STUB_X = 148           # perforation line
DPI = 600
P = DPI / 25.4         # px per mm
mm_ = lambda v: round(v * P)
pt_ = lambda v: round(v * DPI / 72)

RED = (216, 25, 44)
DARK = (28, 28, 28)
GRAY = (115, 115, 115)
LINE = (225, 225, 225)
WHITE = (255, 255, 255)
RTL = dict(direction="rtl", language="ar")


def font(name, pt):
    return ImageFont.truetype(A(name), pt_(pt))


def trim(im, tol=12):
    im = im.convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255)))
    return im.crop(diff.convert("L").point(lambda v: 255 if v > tol else 0).getbbox())


def build_art(t, qr_box):
    """Draw everything except the QR (added as vector later). Returns PIL image."""
    W, H = mm_(W_MM), mm_(H_MM)
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # --- left: poster crop (black panel)
    pc = Image.open(A("poster-crop.png")).convert("RGB")
    pw = mm_(POSTER_W)
    img.paste(pc.resize((pw, H), Image.LANCZOS), (0, 0))

    # --- right: red stub
    d.rectangle([mm_(STUB_X), 0, W, H], fill=RED)

    # --- details panel -------------------------------------------------
    L, R = 59, 141                     # inner left / right (mm)

    # logo (red ticket mark) + admit one
    lg = trim(Image.open(A("as-ticketing-logo.png")))
    lw = mm_(27)
    lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS)
    img.paste(lg, (mm_(L), mm_(5)))
    d.text((mm_(R), mm_(11)), "ADMIT ONE", font=font("Outfit-Bold.ttf", 8), fill=DARK, anchor="rs")
    d.text((mm_(R), mm_(15.2)), "تذكرة دخول", font=font("Janna_LT_Bold.ttf", 8), fill=GRAY, anchor="rs", **RTL)
    d.line([(mm_(L), mm_(20)), (mm_(R), mm_(20))], fill=LINE, width=mm_(0.3))

    lab = font("Outfit-Regular.ttf", 6)
    lab_ar = font("Janna_LT_Bold.ttf", 7)

    def label(x_left, x_right, en, ar, y):
        d.text((mm_(x_left), mm_(y)), en, font=lab, fill=GRAY, anchor="ls")
        d.text((mm_(x_right), mm_(y)), ar, font=lab_ar, fill=GRAY, anchor="rs", **RTL)

    # date + time
    label(L, 96, "DATE", "التاريخ", 25)
    label(103, R, "TIME", "الوقت", 25)
    big = font("Outfit-Bold.ttf", 15)
    sm_ar = font("Janna_LT_Bold.ttf", 8.5)
    d.text((mm_(L), mm_(31.8)), EVENT["date_en"], font=big, fill=DARK, anchor="ls")
    d.text((mm_(L), mm_(36.2)), EVENT["date_ar"], font=sm_ar, fill=GRAY, anchor="ls", **RTL)
    d.text((mm_(103), mm_(31.8)), EVENT["time_en"], font=big, fill=DARK, anchor="ls")
    d.text((mm_(103), mm_(36.2)), EVENT["time_ar"], font=sm_ar, fill=GRAY, anchor="ls", **RTL)

    # venue
    label(L, R, "VENUE", "المكان", 41)
    d.text((mm_(L), mm_(46.6)), EVENT["venue_en"], font=font("Outfit-Bold.ttf", 9.5), fill=DARK, anchor="ls")
    d.text((mm_(R), mm_(46.6)), EVENT["venue_ar"], font=font("Janna_LT_Bold.ttf", 11), fill=RED, anchor="rs", **RTL)
    d.text((mm_(L), mm_(50.4)), EVENT["venue_sub"], font=font("Outfit-Regular.ttf", 6.5), fill=GRAY, anchor="ls")

    # seat boxes
    bw, gap, by0, by1 = 26, 2, 53.5, 68.5
    boxes = [("SECTION", "القسم", t["section"]), ("ROW", "الصف", t["row"]), ("SEAT", "المقعد", t["seat"])]
    for i, (en, ar, val) in enumerate(boxes):
        x0 = L + i * (bw + gap)
        d.rounded_rectangle([mm_(x0), mm_(by0), mm_(x0 + bw), mm_(by1)], radius=mm_(2),
                            outline=RED, width=mm_(0.45))
        cx = mm_(x0 + bw / 2)
        d.text((cx, mm_(by0 + 3.3)), en, font=font("Outfit-Regular.ttf", 5.5), fill=GRAY, anchor="ms")
        d.text((cx, mm_(by0 + 6.3)), ar, font=font("Janna_LT_Bold.ttf", 7), fill=GRAY, anchor="ms", **RTL)
        d.text((cx, mm_(by1 - 2.3)), str(val), font=font("Outfit-Bold.ttf", 19), fill=RED, anchor="ms")

    # holder + ticket no
    hl = font("Outfit-Regular.ttf", 6)
    d.text((mm_(L), mm_(72)), "TICKET HOLDER", font=hl, fill=GRAY, anchor="ls")
    wl = d.textlength("TICKET HOLDER", font=hl)
    d.text((mm_(L) + wl + mm_(2), mm_(72)), "اسم الحامل", font=lab_ar, fill=GRAY, anchor="ls", **RTL)
    d.text((mm_(L), mm_(76.4)), t["name"], font=font("Outfit-Bold.ttf", 8.5), fill=DARK, anchor="ls")
    d.text((mm_(R), mm_(72)), "TICKET NO.", font=lab, fill=GRAY, anchor="rs")
    d.text((mm_(R), mm_(76.4)), t["ticket_no"], font=font("Outfit-Bold.ttf", 8.5), fill=DARK, anchor="rs")

    # --- stub -----------------------------------------------------------
    sc = (STUB_X + W_MM) / 2           # stub centre x (mm)
    d.text((mm_(sc), mm_(6.2)), "ADMIT ONE", font=font("Outfit-Bold.ttf", 8), fill=WHITE, anchor="ms")
    qx0, qy0, qs = qr_box
    pad = 2.6
    d.rounded_rectangle([mm_(qx0 - pad), mm_(qy0 - pad), mm_(qx0 + qs + pad), mm_(qy0 + qs + pad)],
                        radius=mm_(2.5), fill=WHITE)
    base = qy0 + qs + pad
    d.text((mm_(sc), mm_(base + 5.2)), "SCAN AT THE ENTRANCE", font=font("Outfit-Bold.ttf", 6), fill=WHITE, anchor="ms")
    d.text((mm_(sc), mm_(base + 9.2)), "امسح الرمز عند المدخل", font=font("Janna_LT_Bold.ttf", 7.5), fill=WHITE, anchor="ms", **RTL)
    d.text((mm_(sc), mm_(base + 15.2)), f"SEC {t['section']}  ·  ROW {t['row']}  ·  SEAT {t['seat']}",
           font=font("Outfit-Bold.ttf", 7.5), fill=WHITE, anchor="ms")
    d.text((mm_(sc), mm_(H_MM - 3.2)), t["ticket_no"] + "   |   " + EVENT["website"],
           font=font("Outfit-Regular.ttf", 5.8), fill=WHITE, anchor="ms")

    # --- perforation + ticket cut-outs
    for y in range(mm_(3), H - mm_(3), mm_(2.4)):
        d.line([(mm_(STUB_X) + mm_(1.2), y), (mm_(STUB_X) + mm_(1.2), y + mm_(1.2))], fill=WHITE, width=mm_(0.35))
    r = mm_(3.6)
    for cy in (0, H):
        d.ellipse([mm_(STUB_X) - r, cy - r, mm_(STUB_X) + r, cy + r], fill=WHITE)
    # rounded outer corners
    rc = mm_(3)
    mask = Image.new("L", (W * 2, H * 2), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W * 2 - 1, H * 2 - 1], radius=rc * 2, fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    out = Image.new("RGB", (W, H), WHITE)
    out.paste(img, (0, 0), mask)
    return out


def make_ticket(t, out_pdf, preview_png=None):
    sc = (STUB_X + W_MM) / 2
    qs = 31.0
    qr_box = (sc - qs / 2, 11.0, qs)        # x, y (from top), size  (mm)
    art = build_art(t, qr_box)
    if preview_png:
        art.save(preview_png)
    tmp = out_pdf + ".art.png"
    art.save(tmp, dpi=(DPI, DPI))

    c = canvas.Canvas(out_pdf, pagesize=(W_MM * mm, H_MM * mm))
    c.setTitle(f"Ticket {t['ticket_no']} - القرنة البيضا")
    c.setAuthor("AS Ticketing")
    c.drawImage(tmp, 0, 0, width=W_MM * mm, height=H_MM * mm)

    # QR as vector (crisp when printed / scanned)
    payload = t.get("qr") or f"AST|{t['ticket_no']}|{t['section']}|{t['row']}|{t['seat']}|2026-12-26T18:30"
    w = QrCodeWidget(payload, barLevel="M", barBorder=0)
    x1, y1, x2, y2 = w.getBounds()
    size = qs * mm
    dr = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    dr.add(w)
    renderPDF.draw(dr, c, qr_box[0] * mm, (H_MM - qr_box[1] - qs) * mm)
    c.showPage()
    c.save()
    os.remove(tmp)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                make_ticket(row, f"ticket-{row['ticket_no']}.pdf")
                print("created", row["ticket_no"])
    else:
        sample = dict(ticket_no="AST-000123", name="Sample Name", section="A", row="5", seat="12")
        make_ticket(sample, "sample-ticket.pdf", "sample-ticket-preview.png")
        print("sample-ticket.pdf created")
