import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check, X, Wand2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePurchaseRequestDetail, useDecidePurchaseRequest } from '../../hooks/useB2B';
import { billingApi } from '../../services/billingApi';
import { extractErrorMessage } from '../../utils/errorMessage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import BackLink from '../../components/ui/BackLink';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InlineAlert from '../../components/ui/InlineAlert';
import ShelfAllocationEditor from '../../components/shared/ShelfAllocationEditor';
import { REQUEST_STATUS_BADGE } from './PurchaseRequestsPage';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const sumQuantities = (rows) => rows.reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);

// Every message the backend sent for an accept that failed (it lists ALL problems at once).
const acceptErrorMessages = (error) => {
    const items = error?.response?.data?.items;
    if (Array.isArray(items)) return items.map(String);
    if (typeof items === 'string') return [items];
    return [extractErrorMessage(error, 'Failed to accept the request')];
};

const PurchaseRequestDetailPage = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const { toast } = useToast();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: request, loading, error: loadError, refetch } = usePurchaseRequestDetail(id);
    const { accept, deny, mutating } = useDecidePurchaseRequest();

    // Per request item: accepted quantity (string, editable) and the shelves the stock leaves from.
    const [quantities, setQuantities] = useState({});
    const [shelfState, setShelfState] = useState({});   // itemId -> { candidates, allocations }
    const [acceptErrors, setAcceptErrors] = useState([]);
    const [confirmDeny, setConfirmDeny] = useState(false);
    const [bulkAutoAllocating, setBulkAutoAllocating] = useState(false);

    const pending = request?.status === 'pending';

    // When a pending request loads: default each accepted quantity to what can be supplied,
    // and fetch each product's candidate shelves (those currently holding it).
    useEffect(() => {
        if (!request || request.status !== 'pending') return undefined;
        let cancelled = false;
        setQuantities(Object.fromEntries(
            request.items.map((item) => [item.id, String(Math.min(item.requested_quantity, item.available_quantity ?? item.requested_quantity))]),
        ));
        (async () => {
            const entries = await Promise.all(request.items.map(async (item) => {
                try {
                    const candidates = await billingApi.shelves.getCandidates(item.product);
                    return [item.id, candidates?.results ?? candidates ?? []];
                } catch (err) {
                    console.error(`Failed to fetch candidate shelves for item ${item.id}:`, err);
                    return [item.id, []];
                }
            }));
            if (cancelled) return;
            setShelfState(Object.fromEntries(entries.map(([itemId, candidates]) => [itemId, { candidates, allocations: [] }])));
        })();
        return () => { cancelled = true; };
    }, [request]);

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    const qtyOf = (item) => Math.max(0, parseInt(quantities[item.id], 10) || 0);
    const allocationsOf = (item) => shelfState[item.id]?.allocations || [];

    const setItemAllocations = (itemId, next) => {
        setAcceptErrors([]);
        setShelfState((prev) => ({ ...prev, [itemId]: { ...prev[itemId], allocations: next } }));
    };

    const handleAutoAllocateAll = async () => {
        setBulkAutoAllocating(true);
        let failed = 0;
        await Promise.all(request.items.map(async (item) => {
            const needed = qtyOf(item) - sumQuantities(allocationsOf(item));
            if (needed <= 0) return;
            try {
                const exclude = allocationsOf(item).map((a) => a.shelf_id).filter(Boolean);
                const data = await billingApi.shelves.autoAllocate(item.product, needed, exclude);
                const rows = (data?.allocations || []).map((a) => ({ shelf_id: a.shelf_id, quantity: a.quantity, shelf_name: a.shelf_name || '' }));
                if (rows.length) {
                    setShelfState((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], allocations: [...(prev[item.id]?.allocations || []), ...rows] },
                    }));
                }
            } catch (err) {
                console.error(`Failed to auto-allocate item ${item.id}:`, err);
                failed += 1;
            }
        }));
        setBulkAutoAllocating(false);
        if (failed) toast.error(`Auto-allocate failed for ${failed} item(s) — you can still pick shelves manually.`);
        else toast.success('Shelves auto-allocated for all items.');
    };

    const handleAccept = async () => {
        const supplied = request.items.filter((item) => qtyOf(item) > 0);
        if (supplied.length === 0) {
            setAcceptErrors(['Every quantity is zero — deny the request instead.']);
            return;
        }
        const problems = supplied
            .filter((item) => sumQuantities(allocationsOf(item)) !== qtyOf(item))
            .map((item) => `${item.product_name} (${item.product_code}): the shelves must add up to ${qtyOf(item)}.`);
        if (problems.length) {
            setAcceptErrors(problems);
            return;
        }
        setAcceptErrors([]);
        try {
            await accept(request.id, {
                items: request.items.map((item) => ({
                    id: item.id,
                    accepted_quantity: qtyOf(item),
                    shelf_allocations: qtyOf(item) > 0
                        ? allocationsOf(item)
                            .filter((a) => a.shelf_id && a.quantity)
                            .map((a) => ({ shelf_id: parseInt(a.shelf_id, 10), quantity: parseInt(a.quantity, 10) }))
                        : [],
                })),
            });
            toast.success('Request accepted — the invoice was created.');
            await refetch({ silent: true });
        } catch (error) {
            setAcceptErrors(acceptErrorMessages(error));
        }
    };

    const handleDeny = async () => {
        try {
            await deny(request.id);
            toast.success('Request denied');
            setConfirmDeny(false);
            await refetch({ silent: true });
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to deny the request'));
            setConfirmDeny(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!request) {
        return (
            <div className="space-y-4">
                {loadError && <InlineAlert variant="error" message={loadError} onRetry={refetch} />}
                <BackLink to="/b2b/purchase-requests">Back to Purchase Requests</BackLink>
            </div>
        );
    }

    const badge = REQUEST_STATUS_BADGE[request.status] || { variant: 'default', label: request.status };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <BackLink to="/b2b/purchase-requests">Back to Purchase Requests</BackLink>
                    <div className="flex items-center gap-3 flex-wrap mt-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">{request.partner_name}</h1>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-sm text-neutral-500 mt-1">
                        Requested {new Date(request.requested_at).toLocaleString()}
                        {request.decided_at && ` · Decided ${new Date(request.decided_at).toLocaleString()}${request.decided_by ? ` by ${request.decided_by}` : ''}`}
                    </p>
                    {request.note && <p className="text-sm text-neutral-600 mt-2">Note: {request.note}</p>}
                    {request.invoice_number && (
                        <p className="text-sm mt-2">
                            Invoice:{' '}
                            <Link to={`/billing/invoices/${request.invoice}`} className="inline-block py-2 font-medium text-primary-600 hover:underline">
                                {request.invoice_number}
                            </Link>
                        </p>
                    )}
                </div>

                {pending && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" icon={Wand2} onClick={handleAutoAllocateAll} loading={bulkAutoAllocating} disabled={mutating}>
                            Auto-Allocate All
                        </Button>
                        <Button variant="success" icon={Check} onClick={handleAccept} loading={mutating} disabled={bulkAutoAllocating}>
                            Accept
                        </Button>
                        <Button variant="danger" icon={X} onClick={() => setConfirmDeny(true)} disabled={mutating || bulkAutoAllocating}>
                            Deny
                        </Button>
                    </div>
                )}
            </div>

            {acceptErrors.length > 0 && (
                <InlineAlert
                    variant="error"
                    title="The request can't be accepted yet"
                    message={acceptErrors.join('\n')}
                />
            )}

            {pending ? (
                <div className="space-y-4">
                    {request.items.map((item) => {
                        const qty = qtyOf(item);
                        const short = item.available_quantity != null && qty > item.available_quantity;
                        const state = shelfState[item.id] || { candidates: [], allocations: [] };
                        return (
                            <Card key={item.id} className="p-5" hover={false}>
                                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="font-semibold text-neutral-900">
                                            {item.product_name} <span className="text-neutral-400 text-sm font-normal">({item.product_code})</span>
                                        </p>
                                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
                                            <span>Requested: <b>{item.requested_quantity}</b></span>
                                            <span className={short ? 'text-error-600' : ''}>Available now: <b>{item.available_quantity ?? '—'}</b></span>
                                            <span>Rate: <b>{item.current_price == null ? 'No rate set' : `Rs. ${fmt(item.current_price)}`}</b></span>
                                            <span>Discount: <b>{fmt(item.discount)}</b></span>
                                            <span>GST: <b>{fmt(item.gst)}%</b></span>
                                            <span>WHT: <b>{fmt(item.wht)}%</b></span>
                                        </div>
                                    </div>
                                    <div className="w-full lg:w-40">
                                        <Input
                                            label="Accepted quantity"
                                            type="number"
                                            min="0"
                                            value={quantities[item.id] ?? ''}
                                            onChange={(e) => {
                                                setAcceptErrors([]);
                                                setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }));
                                            }}
                                            disabled={mutating}
                                        />
                                    </div>
                                </div>

                                {qty > 0 ? (
                                    <div className="mt-4">
                                        <p className="text-sm font-medium text-neutral-700 mb-2">Shelves the stock leaves from</p>
                                        <ShelfAllocationEditor
                                            mode="consumption"
                                            value={state.allocations}
                                            onChange={(next) => setItemAllocations(item.id, next)}
                                            shelves={state.candidates}
                                            requiredQuantity={qty}
                                            productId={item.product}
                                            autoAllocateApi={billingApi.shelves.autoAllocate}
                                            disabled={mutating}
                                        />
                                    </div>
                                ) : (
                                    <p className="mt-3 text-sm text-neutral-500">Quantity 0 — this item will not be supplied.</p>
                                )}
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <>
                {/* Phones: one card per item. Wide screens: the table below. */}
                <div className="md:hidden space-y-3">
                    {request.items.map((item) => (
                        <Card key={item.id} className="p-4" hover={false}>
                            <p className="font-semibold text-neutral-900">
                                {item.product_name} <span className="text-neutral-400 text-sm font-normal">({item.product_code})</span>
                            </p>
                            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-neutral-500">Requested</dt>
                                <dd className="text-right text-neutral-800">{item.requested_quantity}</dd>
                                <dt className="text-neutral-500">Accepted</dt>
                                <dd className="text-right font-medium text-neutral-800">{request.status === 'accepted' ? (item.accepted_quantity ?? 0) : '—'}</dd>
                                <dt className="text-neutral-500">Price</dt>
                                <dd className="text-right text-neutral-800">{item.effective_price != null ? `Rs. ${fmt(item.effective_price)}` : '—'}</dd>
                                <dt className="text-neutral-500">Discount</dt>
                                <dd className="text-right text-neutral-800">{fmt(item.discount)}</dd>
                                <dt className="text-neutral-500">GST / WHT</dt>
                                <dd className="text-right text-neutral-800">{fmt(item.gst)}% / {fmt(item.wht)}%</dd>
                            </dl>
                        </Card>
                    ))}
                </div>

                <Card className="hidden md:block p-0 overflow-hidden" hover={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    {['Product', 'Requested', 'Accepted', 'Price (PKR)', 'Discount', 'GST', 'WHT'].map((label) => (
                                        <th key={label} className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {request.items.map((item) => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3 text-sm">
                                            <span className="font-medium text-neutral-900">{item.product_name}</span>{' '}
                                            <span className="text-neutral-400">({item.product_code})</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{item.requested_quantity}</td>
                                        <td className="px-4 py-3 text-sm font-medium">{request.status === 'accepted' ? (item.accepted_quantity ?? 0) : '—'}</td>
                                        <td className="px-4 py-3 text-sm">{item.effective_price != null ? `Rs. ${fmt(item.effective_price)}` : '—'}</td>
                                        <td className="px-4 py-3 text-sm">{fmt(item.discount)}</td>
                                        <td className="px-4 py-3 text-sm">{fmt(item.gst)}%</td>
                                        <td className="px-4 py-3 text-sm">{fmt(item.wht)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                </>
            )}

            <ConfirmDialog
                isOpen={confirmDeny}
                onClose={() => setConfirmDeny(false)}
                onConfirm={handleDeny}
                title="Deny Request"
                message={`Deny the purchase request from "${request.partner_name}"? Nothing is invoiced and they will see it as not accepted.`}
                confirmText="Deny"
                loading={mutating}
            />
        </div>
    );
};

export default PurchaseRequestDetailPage;
