import type { CoverageTier } from "@/lib/resource-coverage";

const STYLES: Record<CoverageTier, string> = {
  local:
    "border-emerald-300 bg-emerald-50 text-emerald-900",
  regional:
    "border-amber-300 bg-amber-50 text-amber-950",
  statewide:
    "border-indigo-300 bg-indigo-50 text-indigo-900",
};

interface CoverageBadgeProps {
  tier: CoverageTier;
  label: string;
}

export function CoverageBadge({ tier, label }: CoverageBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-sm font-semibold ${STYLES[tier]}`}
    >
      {label}
    </span>
  );
}
