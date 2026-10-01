import { useState } from 'react';
import { b2bApi } from '../services/b2bApi';
import { usePaginatedList } from './usePaginatedList';

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
