export function CrisisBar({
  labels,
}: {
  labels: { label: string; call988: string; textLine: string };
}) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2">
        <span className="font-medium">{labels.label}</span>
        <a
          href="tel:988"
          className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          {labels.call988}
        </a>
        <a
          href="https://www.crisistextline.org/"
          className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          {labels.textLine}
        </a>
      </div>
    </div>
  );
}
