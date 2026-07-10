"use client";

import { ButtonSpinner } from "@/components/ButtonSpinner";

interface LoadMoreButtonProps {
  loadMoreLabel: string;
  loadingLabel: string;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

export function LoadMoreButton({
  loadMoreLabel,
  loadingLabel,
  hasMore,
  isLoading,
  onLoadMore,
}: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        className="btn-secondary"
        onClick={onLoadMore}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <ButtonSpinner />
            {loadingLabel}
          </>
        ) : (
          loadMoreLabel
        )}
      </button>
    </div>
  );
}
