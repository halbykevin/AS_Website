// Skeleton placeholder shown while the site content loads — mirrors the real
// layout (header, hero banner, headings, card grid) so the page doesn't "pop".
const Box = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-as-charcoal/10 ${className}`} />
)

export default function SiteSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-black/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <Box className="h-10 w-28 sm:h-12" />
          <div className="hidden gap-6 md:flex">
            <Box className="h-4 w-16" />
            <Box className="h-4 w-16" />
            <Box className="h-4 w-16" />
            <Box className="h-9 w-32 rounded-full" />
          </div>
          <Box className="h-10 w-10 md:hidden" />
        </div>
      </div>

      {/* Banner */}
      <Box className="h-52 w-full rounded-none sm:h-80 lg:h-[28rem]" />

      {/* Hero text */}
      <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <Box className="mx-auto h-6 w-44 rounded-full" />
        <Box className="mx-auto mt-6 h-10 w-4/5" />
        <Box className="mx-auto mt-4 h-10 w-2/3" />
        <Box className="mx-auto mt-6 h-4 w-full max-w-xl" />
        <Box className="mx-auto mt-3 h-4 w-5/6 max-w-lg" />
        <div className="mt-9 flex justify-center gap-3">
          <Box className="h-12 w-40 rounded-full" />
          <Box className="h-12 w-40 rounded-full" />
        </div>
      </div>

      {/* Card grid */}
      <div className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-black/5">
              <Box className="h-44 w-full rounded-none" />
              <div className="space-y-3 p-5">
                <Box className="h-5 w-3/4" />
                <Box className="h-4 w-full" />
                <Box className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
