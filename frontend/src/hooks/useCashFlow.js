import { useState, useEffect, useCallback } from 'react';
import { cashFlowApi } from '../services/cashFlowApi';

// Hook for dashboard stats
export const useCashFlowStats = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await cashFlowApi.stats.get();
            setData(result);
        } catch (err) {
            setError(err.message || 'Failed to fetch stats');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return { data, loading, error, refetch: fetchStats };
};

// Hook for breakdown data
export const useBreakdown = (type, initialFilters = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const cleanFilters = {};
            Object.keys(filters).forEach(key => {
                if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                    cleanFilters[key] = filters[key];
                }
            });

            let result;
            switch (type) {
                case 'cashInHand':
                    result = await cashFlowApi.breakdowns.cashInHand(cleanFilters);
                    break;
                case 'invoicesCash':
                    result = await cashFlowApi.breakdowns.invoicesCash(cleanFilters);
                    break;
                case 'customerOutstanding':
                    result = await cashFlowApi.breakdowns.customerOutstanding(cleanFilters);
                    break;
                case 'paidPayables':
                    result = await cashFlowApi.breakdowns.paidPayables(cleanFilters);
                    break;
                case 'supplierOutstanding':
                    result = await cashFlowApi.breakdowns.supplierOutstanding(cleanFilters);
                    break;
                case 'invoices':
                    result = await cashFlowApi.breakdowns.invoices(cleanFilters);
                    break;
                case 'purchases':
                    result = await cashFlowApi.breakdowns.purchases(cleanFilters);
                    break;
                case 'expenses':
                    result = await cashFlowApi.breakdowns.expenses(cleanFilters);
                    break;
                default:
                    result = [];
            }
            setData(result || []);
        } catch (err) {
            setError(err.message || 'Failed to fetch breakdown');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [type, filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, filters, setFilters, refetch: fetchData };
};

// Hook for expense management
export const useExpenses = (initialFilters = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(initialFilters);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const cleanFilters = {};
            Object.keys(filters).forEach(key => {
                if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                    cleanFilters[key] = filters[key];
                }
            });
            const result = await cashFlowApi.expenses.getAll(cleanFilters);
            setData(result || []);
        } catch (err) {
            setError(err.message || 'Failed to fetch expenses');
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
            const result = await cashFlowApi.expenses.create(data);
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
            const result = await cashFlowApi.expenses.update(id, data);
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
            await cashFlowApi.expenses.delete(id);
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

// Hook for expense categories
export const useExpenseCategories = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await cashFlowApi.categories.getAll();
            setData(result || []);
        } catch (err) {
            setError(err.message || 'Failed to fetch categories');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const create = async (data) => {
        setLoading(true);
        try {
            const result = await cashFlowApi.categories.create(data);
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
            const result = await cashFlowApi.categories.update(id, data);
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
            await cashFlowApi.categories.delete(id);
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
        refetch: fetchData,
        create,
        update,
        delete: deleteItem,
    };
};