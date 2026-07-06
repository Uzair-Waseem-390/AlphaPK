import { useState, useEffect, useCallback } from 'react';
import { purchasesApi } from '../services/purchasesApi';

// Generic hook for CRUD operations
export const useCRUD = (service, initialFilters = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await service.getAll(filters);
            setData(result);
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
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
            const result = await service.create(data);
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
            const result = await service.update(id, data);
            await fetchData();
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const deleteItem = async (id) => {
        setLoading(true);
        try {
            await service.delete(id);
            await fetchData();
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
        delete: deleteItem,
    };
};

// Hook for supplier outstanding
export const useSuppliersOutstanding = (initialFilters = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await purchasesApi.suppliers.getOutstanding(filters);
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, filters, setFilters, refetch: fetchData };
};