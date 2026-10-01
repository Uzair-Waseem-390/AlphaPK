import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Share2, Check, X, Ban } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAccessRequests, useAccessRequestAction } from '../../hooks/useB2B';
import { extractErrorMessage } from '../../utils/errorMessage';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Tabs from '../../components/ui/Tabs';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import InlineAlert from '../../components/ui/InlineAlert';

const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Ignored' },
    { value: 'revoked', label: 'Sharing stopped' },
];

const STATUS_BADGE = {
    pending: { variant: 'pending', label: 'Pending' },
    approved: { variant: 'success', label: 'Approved' },
    rejected: { variant: 'error', label: 'Ignored' },
    revoked: { variant: 'warning', label: 'Sharing stopped' },
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

// What each pending confirmation says. Approving is not destructive, so it
// runs straight away; ignoring and stopping a share both confirm first.
const CONFIRMS = {
    reject: {
        title: 'Ignore Request',
        message: (name) => `Ignore the request from "${name}"? They will see it as rejected and can request again later.`,
        confirmText: 'Ignore',
        success: 'Request ignored',
    },
    revoke: {
        title: 'Stop Sharing',
        message: (name) => `Stop sharing your rate list with "${name}"? They lose access immediately and can send a new request.`,
        confirmText: 'Stop Sharing',
        success: 'Sharing stopped',
    },
};

const RateShareRequestsPage = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: requests, meta, page, setPage, loading, initialLoading, error: listError,
        filters, setFilters, refetch,
    } = useAccessRequests();
    const { act, mutating } = useAccessRequestAction();

    const [confirm, setConfirm] = useState(null); // { action, row }
    const [busyId, setBusyId] = useState(null);

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    const run = async (action, row, successMessage) => {
        setBusyId(row.id);
        try {
            await act(row.id, action);
            toast.success(successMessage);
            setConfirm(null);
            await refetch();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Action failed'));
            setConfirm(null);
        } finally {
            setBusyId(null);
        }
    };

    const handleTabChange = (status) => setFilters({ ...filters, status: status || undefined });

    const columns = [
        {
            key: 'partner_name',
            label: 'Partner',
            render: (value) => <span className="font-medium text-neutral-900">{value}</span>,
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => {
                const badge = STATUS_BADGE[value] || { variant: 'default', label: value };
                return <Badge variant={badge.variant}>{badge.label}</Badge>;
            },
        },
        {
            key: 'requested_at',
            label: 'Requested',
            render: (value) => <span className="text-neutral-600">{formatDateTime(value)}</span>,
        },
        {
            key: 'status_changed_at',
            label: 'Last Change',
            render: (value, row) => (
                <div className="text-neutral-600">
                    <div>{formatDateTime(value)}</div>
                    {row.decided_by && <div className="text-xs text-neutral-400">by {row.decided_by}</div>}
                </div>
            ),
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '220px',
            render: (_value, row) => {
                const busy = busyId === row.id;
                return (
                    <div className="flex flex-wrap gap-2">
                        {(row.status === 'pending' || row.status === 'rejected') && (
                            <Button
                                size="sm"
                                variant="success"
                                icon={Check}
                                loading={busy && !confirm}
                                disabled={mutating}
                                onClick={() => run('approve', row, 'Request approved')}
                            >
                                Approve
                            </Button>
                        )}
                        {row.status === 'pending' && (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={X}
                                disabled={mutating}
                                onClick={() => setConfirm({ action: 'reject', row })}
                            >
                                Ignore
                            </Button>
                        )}
                        {row.status === 'approved' && (
                            <Button
                                size="sm"
                                variant="danger"
                                icon={Ban}
                                disabled={mutating}
                                onClick={() => setConfirm({ action: 'revoke', row })}
                            >
                                Stop Sharing
                            </Button>
                        )}
                        {row.status === 'revoked' && (
                            <span className="text-sm text-neutral-400">Waiting for a new request</span>
                        )}
                    </div>
                );
            },
        },
    ];

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    const confirmCopy = confirm ? CONFIRMS[confirm.action] : null;

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-2.5">
                    <Share2 className="w-6 h-6 text-primary-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Rate List Sharing</h1>
                </div>
                <p className="text-neutral-500 mt-1">
                    Approve which of your partner softwares can see your rate list. Only product code,
                    name and selling price are shared, and only for products that have a price.
                </p>
            </div>

            {listError && (
                <InlineAlert variant="error" title="Couldn't load requests" message={listError} onRetry={refetch} />
            )}

            <Tabs tabs={STATUS_TABS} activeTab={filters.status || ''} onChange={handleTabChange} className="overflow-x-auto" />

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <LoadingSpinner size="lg" />
                </div>
            ) : requests.length === 0 ? (
                <EmptyState
                    title="No Requests"
                    description="When a partner software asks to see your rate list, the request appears here."
                />
            ) : (
                <>
                    <Table columns={columns} data={requests} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <ConfirmDialog
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={() => run(confirm.action, confirm.row, confirmCopy.success)}
                title={confirmCopy?.title}
                message={confirm ? confirmCopy.message(confirm.row.partner_name) : ''}
                confirmText={confirmCopy?.confirmText}
                loading={mutating}
            />
        </div>
    );
};

export default RateShareRequestsPage;
