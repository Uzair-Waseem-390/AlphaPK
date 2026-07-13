import { useState, useEffect, useCallback } from 'react';
import { ratesApi } from '../services/ratesApi';
import { purchasesApi } from '../services/purchasesApi';
import { usePaginatedList } from './usePaginatedList';

// Client-side filtering applied to the best-effort "unpriced products" list,
// mirroring the search/category filters that are sent to the backend for
// the (paginated) rates list itself.
const filterProducts = (products, filters) => {
    let filtered = products;
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(product =>
            (product.name && product.name.toLowerCase().includes(searchLower)) ||
            (product.code && product.code.toLowerCase().includes(searchLower))
        );
    }
    if (filters.category) {
        filtered = filtered.filter(product => {
            const catId = product.category?.id || product.category;
            return String(catId) === String(filters.category);
        });
    }
    return filtered;
};

export const useRates = (initialFilters = {}) => {
    // Main rates table — paginated (25/page) like every other list endpoint.
    const {
        data: rates, meta, loading: listLoading, error: listError,
        filters, setFilters, page, setPage, refetch,
    } = usePaginatedList(ratesApi.getAll, initialFilters);

    // Rates are viewable by every role; the full product list is
    // Purchases-app-gated (admin/superuser only), so it's fetched best-effort
    // with page_size:500 (everything in one call) and simply stays empty for
    // normal users. A full (page_size:500) rates fetch runs alongside it so
    // "has a rate" can be determined across ALL rates, not just the current
    // page — otherwise a product priced on another page would incorrectly
    // show up again here as unpriced.
    const [allProducts, setAllProducts] = useState([]);
    const [allRatedProductIds, setAllRatedProductIds] = useState(new Set());
    // Bumped after every create/update so the full-catalog "which products are
    // already priced" set is refreshed — otherwise a just-priced product stays
    // in the set as stale and shows a second time as "No price set".
    const [catalogVersion, setCatalogVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [productsResult, allRatesResult] = await Promise.allSettled([
                purchasesApi.products.getAll({ page_size: 500 }),
                ratesApi.getAll({ page_size: 500 }),
            ]);
            if (cancelled) return;
            const products = productsResult.status === 'fulfilled'
                ? (productsResult.value?.results || productsResult.value || [])
                : [];
            const allRates = allRatesResult.status === 'fulfilled'
                ? (allRatesResult.value?.results || allRatesResult.value || [])
                : [];
            setAllProducts(products);
            setAllRatedProductIds(new Set(
                allRates.filter(rate => rate.product?.id).map(rate => rate.product.id)
            ));
        })();
        return () => { cancelled = true; };
    }, [catalogVersion]);

    // Exclude products already shown (with a price) on the current rates page,
    // so a just-priced product never appears a second time as "No price set"
    // even before the catalog set above has refreshed.
    const ratedIdsOnPage = new Set(rates.map(r => r.product?.id).filter(Boolean));
    const productsWithoutRate = allProducts.filter(
        product => !allRatedProductIds.has(product.id) && !ratedIdsOnPage.has(product.id)
    );

    // Current page of priced rates, followed by any (filtered) unpriced
    // products — same ordering the old client-side combine used.
    const data = [
        ...rates.map(rate => ({ product: rate.product, rate })),
        ...filterProducts(productsWithoutRate, filters).map(product => ({ product, rate: null })),
    ];

    // Category filter dropdown derived from the FULL product catalog rather
    // than the current page of rates, so options don't disappear/change as
    // the user pages through the table.
    const categories = [...new Map(
        allProducts
            .map(product => product.category)
            .filter(Boolean)
            .map(category => [category.id, category])
    ).values()];

    const [mutating, setMutating] = useState(false);
    const [mutationError, setMutationError] = useState(null);

    const create = async (payload) => {
        setMutating(true);
        try {
            const result = await ratesApi.create(payload);
            await refetch();
            setCatalogVersion(v => v + 1);
            return result;
        } catch (err) {
            setMutationError(err.message);
            throw err;
        } finally {
            setMutating(false);
        }
    };

    const update = async (id, payload) => {
        setMutating(true);
        try {
            const result = await ratesApi.update(id, payload);
            await refetch();
            setCatalogVersion(v => v + 1);
            return result;
        } catch (err) {
            setMutationError(err.message);
            throw err;
        } finally {
            setMutating(false);
        }
    };

    return {
        data,
        meta,
        page,
        setPage,
        loading: listLoading || mutating,
        error: listError || mutationError,
        filters,
        setFilters,
        categories,
        refetch,
        create,
        update,
    };
};

export const useRateHistory = (productId) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchHistory = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await ratesApi.getHistory(productId, { page_size: 500 });
            setData(result?.results ?? result ?? []);
        } catch (err) {
            setError(err.message || 'Failed to fetch history');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return { data, loading, error, refetch: fetchHistory };
};
