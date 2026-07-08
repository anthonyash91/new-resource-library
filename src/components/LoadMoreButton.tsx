"use client";

import Link from "next/link";

interface LoadMoreButtonProps {
  loadMoreLabel: string;
  nextPage: number;
  searchParams: Record<string, string | undefined>;
  hasMore: boolean;
}

export function LoadMoreButton({ loadMoreLabel, nextPage, searchParams, hasMore }: LoadMoreButtonProps) {
  if (!hasMore) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(nextPage));

  return (
    <div className="flex justify-center pt-4">
      <Link href={`/resources?${params.toString()}`} className="btn-secondary">
        {loadMoreLabel}
      </Link>
    </div>
  );
}
