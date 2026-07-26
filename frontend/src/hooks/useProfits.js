import { useState, useEffect, useCallback } from 'react';
import { profitsApi } from '../services/profitsApi';

// Hook for the Business Worth breakdown + ownership split
export const useBusinessWorth = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await profitsApi.businessWorth.get();
            setData(result);
        } catch (err) {
            setError(err.message || 'Failed to fetch business worth');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, refetch: fetchData };
};
