import { useState, useEffect, useCallback, useRef } from 'react';

// Shared primitive: unwraps a {count, total_pages, current_page, page_size,
// results} paginated response and tracks page/filters state. Every list
// consumer in the app routes through this, directly or via a wrapping hook.
//
// `deps` — extra values that a caller's fetchFn closes over (e.g. a page's
// local searchTerm / activeTab). Listing them here re-runs the fetch when they
// change. It does NOT need to (and must not) include fetchFn itself: fetchFn is
// held in a ref so an inline arrow recreated every render doesn't retrigger the
// effect — that was previously causing an infinite refetch loop.
export const usePaginatedList = (fetchFn, initialFilters = {}, pageSize = 25, deps = []) => {
    const [results, setResults] = useState([]);
    const [meta, setMeta] = useState({ count: 0, totalPages: 1, currentPage: 1, pageSize });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFiltersState] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [extra, setExtra] = useState({});

    // Keep the latest fetchFn without making it an effect dependency.
    const fetchFnRef = useRef(fetchFn);
    fetchFnRef.current = fetchFn;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchFnRef.current({ ...filters, page, page_size: pageSize });
            // Some endpoints (e.g. Suppliers) are deliberately excluded from
            // pagination and still return a plain array — handle both shapes.
            if (Array.isArray(response)) {
                setResults(response);
                setMeta({ count: response.length, totalPages: 1, currentPage: 1, pageSize: response.length });
                setExtra({});
            } else {
                setResults(response?.results || []);
                setMeta({
                    count: response?.count ?? 0,
                    totalPages: response?.total_pages ?? 1,
                    currentPage: response?.current_page ?? page,
                    pageSize: response?.page_size ?? pageSize,
                });
                // Any extra top-level fields a view adds (e.g. "stats") pass through as-is.
                const { count, total_pages, current_page, page_size, results, ...rest } = response || {};
                setExtra(rest);
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
            setResults([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page, pageSize, ...deps]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Changing filters always resets back to page 1.
    const setFilters = (newFilters) => {
        setFiltersState(newFilters);
        setPage(1);
    };

    return { data: results, meta, extra, loading, error, filters, setFilters, page, setPage, refetch: fetchData };
};
