import { Navigate, useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePurchaseRequests } from '../../hooks/useB2B';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Tabs from '../../components/ui/Tabs';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import InlineAlert from '../../components/ui/InlineAlert';

const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'denied', label: 'Denied' },
];

export const REQUEST_STATUS_BADGE = {
    pending: { variant: 'pending', label: 'Pending' },
    accepted: { variant: 'success', label: 'Accepted' },
    denied: { variant: 'error', label: 'Denied' },
    cancelled: { variant: 'default', label: 'Cancelled' },
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

const PurchaseRequestsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: requests, meta, page, setPage, loading, initialLoading, error: listError,
        filters, setFilters, refetch,
    } = usePurchaseRequests();

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    const columns = [
        {
            key: 'partner_name',
            label: 'Partner',
            render: (value) => <span className="font-medium text-neutral-900">{value}</span>,
        },
        {
            key: 'requested_at',
            label: 'Requested',
            render: (value) => <span className="text-neutral-600">{formatDateTime(value)}</span>,
        },
        {
            key: 'item_count',
            label: 'Items',
            width: '90px',
            render: (value) => <span className="text-neutral-700">{value}</span>,
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => {
                const badge = REQUEST_STATUS_BADGE[value] || { variant: 'default', label: value };
                return <Badge variant={badge.variant}>{badge.label}</Badge>;
            },
        },
        {
            key: 'invoice_number',
            label: 'Invoice',
            render: (value) => value || <span className="text-neutral-300">—</span>,
        },
    ];

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-2.5">
                    <ShoppingCart className="w-6 h-6 text-primary-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Purchase Requests</h1>
                </div>
                <p className="text-neutral-500 mt-1">
                    Orders your partner softwares want to buy from you. Open one to adjust quantities,
                    pick the shelves the stock leaves from, and accept or deny it.
                </p>
            </div>

            {listError && (
                <InlineAlert variant="error" title="Couldn't load requests" message={listError} onRetry={refetch} />
            )}

            <Tabs
                tabs={STATUS_TABS}
                activeTab={filters.status || ''}
                onChange={(status) => setFilters({ ...filters, status: status || undefined })}
                className="overflow-x-auto"
            />

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <LoadingSpinner size="lg" />
                </div>
            ) : requests.length === 0 ? (
                <EmptyState
                    title="No Purchase Requests"
                    description="When a partner software asks to buy from you, the request appears here."
                />
            ) : (
                <>
                    {/* Wide screens: the table. Phones: one tappable card per request (no sideways scrolling). */}
                    <div className="hidden md:block">
                        <Table columns={columns} data={requests} onRowClick={(row) => navigate(`/b2b/purchase-requests/${row.id}`)} />
                    </div>
                    <div className="md:hidden space-y-3">
                        {requests.map((row) => {
                            const badge = REQUEST_STATUS_BADGE[row.status] || { variant: 'default', label: row.status };
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => navigate(`/b2b/purchase-requests/${row.id}`)}
                                    className="w-full text-left bg-white rounded-2xl p-4 shadow-card active:bg-neutral-50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="font-semibold text-neutral-900">{row.partner_name}</span>
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                    </div>
                                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                        <dt className="text-neutral-500">Requested</dt>
                                        <dd className="text-right text-neutral-700">{formatDateTime(row.requested_at)}</dd>
                                        <dt className="text-neutral-500">Items</dt>
                                        <dd className="text-right text-neutral-700">{row.item_count}</dd>
                                        <dt className="text-neutral-500">Invoice</dt>
                                        <dd className="text-right text-neutral-700">{row.invoice_number || '—'}</dd>
                                    </dl>
                                </button>
                            );
                        })}
                    </div>
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default PurchaseRequestsPage;
