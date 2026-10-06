import { useState, useEffect, useCallback } from 'react';
import { b2bApi } from '../services/b2bApi';
import { usePaginatedList } from './usePaginatedList';
import { extractErrorMessage } from '../utils/errorMessage';

// Paginated list of partner rate-list access requests (newest first).
export const useAccessRequests = (initialFilters = {}) => {
    const {
        data, meta, loading, initialLoading, error, filters, setFilters, page, setPage, refetch,
    } = usePaginatedList((params) => b2bApi.requests.getAll(params), initialFilters);

    return { data, meta, loading, initialLoading, error, filters, setFilters, page, setPage, refetch };
};

// Approve / reject (ignore) / revoke (stop sharing) one request. The page owns
// the toast and the refetch, same split as every other mutation hook.
export const useAccessRequestAction = () => {
    const [mutating, setMutating] = useState(false);

    const act = async (id, action) => {
        setMutating(true);
        try {
            return await b2bApi.requests[action](id);
        } finally {
            setMutating(false);
        }
    };

    return { act, mutating };
};

// Paginated list of purchase requests partner softwares have sent us (cancelled ones never appear).
export const usePurchaseRequests = (initialFilters = {}) => {
    const {
        data, meta, loading, initialLoading, error, filters, setFilters, page, setPage, refetch,
    } = usePaginatedList((params) => b2bApi.purchaseRequests.getAll(params), initialFilters);

    return { data, meta, loading, initialLoading, error, filters, setFilters, page, setPage, refetch };
};

// One request, with live availability while it is pending. Hand-rolled (not list-shaped).
export const usePurchaseRequestDetail = (id) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetail = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            setData(await b2bApi.purchaseRequests.getById(id));
        } catch (err) {
            setError(extractErrorMessage(err, 'Failed to load the request'));
            if (!silent) setData(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    return { data, loading, error, refetch: fetchDetail };
};

// Accept (quantities + shelves) or deny one request. The page owns toasts and the refetch.
export const useDecidePurchaseRequest = () => {
    const [mutating, setMutating] = useState(false);

    const run = async (fn) => {
        setMutating(true);
        try {
            return await fn();
        } finally {
            setMutating(false);
        }
    };

    return {
        accept: (id, payload) => run(() => b2bApi.purchaseRequests.accept(id, payload)),
        deny: (id) => run(() => b2bApi.purchaseRequests.deny(id)),
        mutating,
    };
};
