// The prize, drawn as inline SVG instead of shipped as an image: a cream gift
// card with the AS crest, the face value in brand red, and a barcode. A viewBox
// makes every element scale with the card, so it is crisp at any size and the
// amount stays editable text rather than baked-in pixels.

// Deterministic barcode bars — irregular widths, no asset, no randomness on
// re-render. Pairs of [width, gap] walked across the strip.
const BAR_PATTERN = [3, 2, 1, 3, 4, 2, 1, 2, 2, 4, 3, 1, 1, 3, 2, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 3, 1, 2, 4]
function barcodeRects(x, y, height, unit = 3.2) {
  const rects = []
  let cursor = x
  BAR_PATTERN.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x: cursor, w: w * unit })
    cursor += w * unit
  })
  return rects.map((r, i) => <rect key={i} x={r.x} y={y} width={r.w} height={height} fill="#1d1d1f" />)
}

export default function Voucher({
  amount = '$100',
  note = 'Valid for one-time purchase only',
  logo,
  className = '',
}) {
  return (
    <svg
      viewBox="0 0 800 400"
      className={`w-full ${className}`}
      role="img"
      aria-label={`${amount} AS Company gift voucher`}
    >
      <title>{`${amount} AS Company gift voucher`}</title>

      {/* Card body + the red band down the right edge */}
      <clipPath id="voucher-clip">
        <rect x="0" y="0" width="800" height="400" rx="26" />
      </clipPath>
      <g clipPath="url(#voucher-clip)">
        <rect x="0" y="0" width="800" height="400" fill="#F7F1E4" />
        <rect x="726" y="0" width="74" height="400" fill="#A41E22" />
      </g>
      <rect x="1" y="1" width="798" height="398" rx="26" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />

      {/* Headline */}
      <text x="52" y="112" fill="#1d1d1f" fontSize="72" fontWeight="800" letterSpacing="-1">
        VOUCHER
      </text>
      <text x="52" y="176" fill="#1d1d1f" fontSize="50" fontWeight="500">
        Gift Card
      </text>

      {/* Face value */}
      <text x="700" y="180" fill="#A41E22" fontSize="104" fontWeight="800" textAnchor="end">
        {amount}
      </text>

      {/* Barcode */}
      {barcodeRects(452, 224, 74)}

      {/* Crest — the uploaded logo when there is one, else a drawn wordmark */}
      {logo ? (
        <image href={logo} x="52" y="250" width="150" height="96" preserveAspectRatio="xMinYMax meet" />
      ) : (
        <g>
          <text x="52" y="316" fill="#A41E22" fontSize="76" fontWeight="800" letterSpacing="-2">
            AS
          </text>
          <text x="52" y="346" fill="#1d1d1f" fontSize="20" fontWeight="600" letterSpacing="3">
            COMPANY
          </text>
          <text x="52" y="368" fill="#1d1d1f" fontSize="13" fontWeight="500" letterSpacing="2">
            ABSOLUTE SOLUTIONS SAL
          </text>
        </g>
      )}

      {/* Small print — centred under the barcode so it clears the red band */}
      <text x="562" y="342" fill="#1d1d1f" fontSize="19" fontWeight="500" textAnchor="middle">
        {note}
      </text>
    </svg>
  )
}
