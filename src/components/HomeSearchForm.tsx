"use client";

import { useRouter } from "next/navigation";
import { FormEvent } from "react";

interface HomeSearchFormProps {
  labels: {
    placeholder: string;
    searchButton: string;
  };
  defaultQuery?: string;
}

export function HomeSearchForm({ labels, defaultQuery = "" }: HomeSearchFormProps) {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const q = String(form.get("q") ?? "").trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/resources${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
      <label htmlFor="home-search" className="sr-only">
        {labels.placeholder}
      </label>
      <input
        id="home-search"
        name="q"
        type="search"
        defaultValue={defaultQuery}
        placeholder={labels.placeholder}
        className="input-field flex-1"
        autoComplete="off"
      />
      <button type="submit" className="btn-primary shrink-0">
        {labels.searchButton}
      </button>
    </form>
  );
}
