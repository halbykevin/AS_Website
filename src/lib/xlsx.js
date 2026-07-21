// Minimal, dependency-free .xlsx writer.
//
// Builds a genuine single-sheet Office Open XML workbook (the format Excel opens
// with no "file format doesn't match" warning) from an array-of-arrays and
// triggers a browser download — no libraries, no backend round-trip.
//
// Supported cell values: numbers (stored as numbers) and everything else
// (stored as inline strings). The first row is styled bold as a header.

const enc = (s) => new TextEncoder().encode(s)

// CRC-32 (used by the ZIP container) — precomputed lookup table.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Pack the given files into a store-only (uncompressed) ZIP — enough for a
// small spreadsheet and simple enough to hand-roll correctly.
function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameBytes = enc(f.name)
    const data = f.data
    const crc = crc32(data)

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true) // local file header signature
    lh.setUint16(4, 20, true) // version needed
    lh.setUint16(6, 0, true) // flags
    lh.setUint16(8, 0, true) // method: store
    lh.setUint16(10, 0, true) // mod time
    lh.setUint16(12, 0x21, true) // mod date (1980-01-01)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true) // compressed size
    lh.setUint32(22, data.length, true) // uncompressed size
    lh.setUint16(26, nameBytes.length, true)
    lh.setUint16(28, 0, true) // extra length
    parts.push(new Uint8Array(lh.buffer), nameBytes, data)

    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true) // central dir header signature
    ch.setUint16(4, 20, true) // version made by
    ch.setUint16(6, 20, true) // version needed
    ch.setUint16(8, 0, true)
    ch.setUint16(10, 0, true) // method: store
    ch.setUint16(12, 0, true)
    ch.setUint16(14, 0x21, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, data.length, true)
    ch.setUint32(24, data.length, true)
    ch.setUint16(28, nameBytes.length, true)
    ch.setUint16(30, 0, true)
    ch.setUint16(32, 0, true)
    ch.setUint16(34, 0, true)
    ch.setUint16(36, 0, true)
    ch.setUint32(38, 0, true)
    ch.setUint32(42, offset, true) // relative offset of local header
    central.push(new Uint8Array(ch.buffer), nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true) // end of central dir signature
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true) // offset of central dir
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))

// 0-based column index → spreadsheet letter (0 → A, 26 → AA).
function colName(n) {
  let s = ''
  n += 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function sheetXml(aoa) {
  const rows = aoa
    .map((cells, r) => {
      const style = r === 0 ? ' s="1"' : '' // header row uses the bold style
      const cellXml = cells
        .map((val, c) => {
          const ref = colName(c) + (r + 1)
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<c r="${ref}"${style}><v>${val}</v></c>`
          }
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(val == null ? '' : val)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cellXml}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

/**
 * Build an .xlsx from an array-of-arrays (first row = header) and download it.
 * @param {string} filename e.g. "entries.xlsx"
 * @param {Array<Array<string|number>>} aoa rows of cells
 * @param {string} [sheetName] worksheet tab name
 */
export function downloadXlsx(filename, aoa, sheetName = 'Sheet1') {
  const files = [
    {
      name: '[Content_Types].xml',
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/styles.xml',
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: enc(sheetXml(aoa)) },
  ]

  const url = URL.createObjectURL(zip(files))
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
