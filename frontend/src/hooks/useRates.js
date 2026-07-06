import { useState, useEffect, useCallback } from 'react';
import { ratesApi } from '../services/ratesApi';
import { purchasesApi } from '../services/purchasesApi';

// Helper to combine products with their rates
const combineProductsWithRates = (products, rates) => {
    const rateMap = {};
    rates.forEach(rate => {
        if (rate.product?.id) {
            rateMap[rate.product.id] = rate;
        }
    });

    return products.map(product => ({
        product: product,
        rate: rateMap[product.id] || null,
    }));
};

export const useRates = (initialFilters = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch products and rates in parallel
            const [products, rates] = await Promise.all([
                purchasesApi.products.getAll(),
                ratesApi.getAll(filters),
            ]);

            // Combine products with their rates
            const combined = combineProductsWithRates(products || [], rates || []);
            setData(combined);
        } catch (err) {
            setError(err.message || 'Failed to fetch rates');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const create = async (data) => {
        setLoading(true);
        try {
            const result = await ratesApi.create(data);
            await fetchData();
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const update = async (id, data) => {
        setLoading(true);
        try {
            const result = await ratesApi.update(id, data);
            await fetchData();
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return {
        data,
        loading,
        error,
        filters,
        setFilters,
        refetch: fetchData,
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
            const result = await ratesApi.getHistory(productId);
            setData(result || []);
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