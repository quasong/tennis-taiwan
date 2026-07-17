"use client";

import { useI18n } from "../../i18n/I18nProvider";

export const MATCHES_PAGE_SIZE = 10;

type PaginationProps = {
  ariaLabel: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  totalItems: number;
};

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = Array.from(
    new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])
  )
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  pages.forEach((page, index) => {
    const previousPage = pages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push(`ellipsis-${previousPage}`);
    }

    items.push(page);
  });

  return items;
}

export function Pagination({
  ariaLabel,
  currentPage,
  onPageChange,
  pageSize = MATCHES_PAGE_SIZE,
  totalItems,
}: PaginationProps) {
  const { t } = useI18n();
  const totalPages = Math.ceil(totalItems / pageSize);

  if (totalPages <= 1) return null;

  const firstVisibleItem = (currentPage - 1) * pageSize + 1;
  const lastVisibleItem = Math.min(currentPage * pageSize, totalItems);
  const paginationItems = getPaginationItems(currentPage, totalPages);

  return (
    <nav className="match-pagination" aria-label={ariaLabel}>
      <div className="match-pagination-summary">
        <strong>
          {firstVisibleItem}–{lastVisibleItem}
        </strong>
        <span>{t("common.matchesUnit", { count: totalItems })}</span>
      </div>
      <div className="match-pagination-controls">
        <button
          aria-label={t("pagination.previous")}
          className="pagination-arrow"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          title={t("pagination.previous")}
          type="button"
        >
          <span aria-hidden="true">‹</span>
        </button>

        {paginationItems.map((item) =>
          typeof item === "number" ? (
            <button
              aria-label={t("pagination.page", { page: item })}
              aria-current={item === currentPage ? "page" : undefined}
              className={item === currentPage ? "active" : ""}
              key={item}
              onClick={() => onPageChange(item)}
              type="button"
            >
              {item}
            </button>
          ) : (
            <span aria-hidden="true" className="pagination-ellipsis" key={item}>
              …
            </span>
          )
        )}

        <button
          aria-label={t("pagination.next")}
          className="pagination-arrow"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title={t("pagination.next")}
          type="button"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </nav>
  );
}
