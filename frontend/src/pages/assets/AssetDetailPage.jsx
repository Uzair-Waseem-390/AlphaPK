import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { assetsApi } from '../../services/assetsApi';
import { useAssetValuationEntries, useAssetStats } from '../../hooks/useAssets';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const AssetDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [asset, setAsset] = useState(null);
    const [loading, setLoading] = useState(true);

    const {
        data: entries, meta, page, setPage, loading: entriesLoading, refetch: refetchEntries,
    } = useAssetValuationEntries({ asset_id: id });
    const { refetch: refetchStats } = useAssetStats();

    const [showRevalueModal, setShowRevalueModal] = useState(false);
    const [revalueForm, setRevalueForm] = useState({
        new_worth: '', revaluation_date: new Date().toISOString().split('T')[0], note: '',
    });
    const [revalueLoading, setRevalueLoading] = useState(false);
    const [revalueError, setRevalueError] = useState('');

    const [showDisposeModal, setShowDisposeModal] = useState(false);
    const [disposeForm, setDisposeForm] = useState({
        disposal_type: 'scrapped', disposal_date: new Date().toISOString().split('T')[0],
        sale_amount: '', reason: '',
    });
    const [disposeLoading, setDisposeLoading] = useState(false);
    const [disposeError, setDisposeError] = useState('');

    useEffect(() => {
        fetchAsset();
    }, [id]);

    const fetchAsset = async () => {
        setLoading(true);
        try {
            const data = await assetsApi.items.getById(id);
            setAsset(data);
        } catch (error) {
            console.error('Failed to fetch asset:', error);
            setAsset(null);
        } finally {
            setLoading(false);
        }
    };

    const handleRevalue = async (e) => {
        e.preventDefault();
        setRevalueError('');
        setRevalueLoading(true);
        try {
            await assetsApi.items.revalue(id, { ...revalueForm, new_worth: parseFloat(revalueForm.new_worth) });
            setShowRevalueModal(false);
            setRevalueForm({ new_worth: '', revaluation_date: new Date().toISOString().split('T')[0], note: '' });
            await Promise.all([fetchAsset(), refetchEntries(), refetchStats()]);
        } catch (error) {
            setRevalueError(error.response?.data?.detail || error.response?.data?.new_worth?.[0] || 'Failed to revalue asset');
        } finally {
            setRevalueLoading(false);
        }
    };

    const handleDispose = async (e) => {
        e.preventDefault();
        setDisposeError('');
        setDisposeLoading(true);
        try {
            const payload = { ...disposeForm };
            if (payload.disposal_type === 'scrapped') {
                delete payload.sale_amount;
            } else {
                payload.sale_amount = parseFloat(payload.sale_amount);
            }
            await assetsApi.items.dispose(id, payload);
            setShowDisposeModal(false);
            await Promise.all([fetchAsset(), refetchStats()]);
        } catch (error) {
            setDisposeError(error.response?.data?.detail || error.response?.data?.sale_amount?.[0] || 'Failed to dispose asset');
        } finally {
            setDisposeLoading(false);
        }
    };

    const columns = [
        { key: 'period', label: 'Period' },
        {
            key: 'entry_type',
            label: 'Type',
            render: (v) => v === 'depreciation'
                ? <Badge variant="warning" size="sm">Depreciation</Badge>
                : <Badge variant="info" size="sm">Revaluation</Badge>,
        },
        { key: 'rate_applied', label: 'Rate', render: (v) => v ? `${(parseFloat(v) * 100).toFixed(2)}%` : <span className="text-neutral-300">—</span> },
        { key: 'worth_before', label: 'Worth Before', render: (v) => `Rs. ${fmt(v)}` },
        {
            key: 'amount',
            label: 'Change',
            render: (v) => (
                <span className={parseFloat(v) < 0 ? 'text-error-600 font-semibold' : 'text-success-600 font-semibold'}>
                    {parseFloat(v) >= 0 ? '+' : ''}Rs. {fmt(v)}
                </span>
            ),
        },
        { key: 'worth_after', label: 'Worth After', render: (v) => <span className="font-semibold">Rs. {fmt(v)}</span> },
        { key: 'note', label: 'Note', render: (v) => v || <span className="text-neutral-300">—</span> },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view assets.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!asset) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Asset Not Found</h2>
                <Link to="/assets/items" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Assets
                </Link>
            </div>
        );
    }

    const isRevaluationCategory = asset.valuation_method === 'revaluation';
    const accumulatedChange = parseFloat(asset.cost) - parseFloat(asset.current_worth);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <Link to="/assets/items" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Assets
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                        <h1 className="text-3xl font-bold text-neutral-900">{asset.name}</h1>
                        {asset.is_disposed
                            ? <Badge variant="error">Disposed</Badge>
                            : <Badge variant="success">Active</Badge>}
                    </div>
                    <p className="text-neutral-500">{asset.category_name} · {asset.acquisition_type === 'new' ? 'New purchase' : 'Existing asset'}</p>
                </div>
                {!asset.is_disposed && (
                    <div className="flex gap-2">
                        {isRevaluationCategory && (
                            <Button variant="secondary" onClick={() => setShowRevalueModal(true)}>
                                Revalue
                            </Button>
                        )}
                        <Button variant="danger" onClick={() => setShowDisposeModal(true)}>
                            Dispose
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Cost</p>
                    <p className="text-xl font-bold text-info-600">Rs. {fmt(asset.cost)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Current Worth</p>
                    <p className="text-xl font-bold text-purple-600">Rs. {fmt(asset.current_worth)}</p>
                </Card>
                {!isRevaluationCategory && (
                    <Card className="p-4">
                        <p className="text-xs text-neutral-500 mb-1">Accumulated Depreciation</p>
                        <p className="text-xl font-bold text-orange-600">Rs. {fmt(accumulatedChange)}</p>
                    </Card>
                )}
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Acquisition Date</p>
                    <p className="text-xl font-bold text-neutral-900">{new Date(asset.acquisition_date).toLocaleDateString()}</p>
                </Card>
            </div>

            {asset.note && (
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Note</p>
                    <p className="font-medium">{asset.note}</p>
                </Card>
            )}

            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Valuation History</h2>
                {entriesLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">📜</div>
                        <h3 className="text-lg font-semibold text-neutral-900">No History Yet</h3>
                        <p className="text-sm text-neutral-500 mt-1">
                            {isRevaluationCategory ? 'Revalue this asset to create the first entry.' : 'Depreciation entries appear automatically as months pass.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <Table columns={columns} data={entries} />
                        {meta.totalPages > 1 && (
                            <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                        )}
                    </>
                )}
            </div>

            {/* Revalue Modal */}
            <Modal
                isOpen={showRevalueModal}
                onClose={() => setShowRevalueModal(false)}
                title="Revalue Asset"
                size="lg"
            >
                <form onSubmit={handleRevalue} className="space-y-4">
                    <p className="text-sm text-neutral-500">
                        Current worth: <strong>Rs. {fmt(asset.current_worth)}</strong>
                    </p>
                    <Input
                        label="New Worth (PKR)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={revalueForm.new_worth}
                        onChange={(e) => setRevalueForm({ ...revalueForm, new_worth: e.target.value })}
                        required
                    />
                    <Input
                        label="Revaluation Date"
                        type="date"
                        value={revalueForm.revaluation_date}
                        onChange={(e) => setRevalueForm({ ...revalueForm, revaluation_date: e.target.value })}
                        required
                    />
                    <Input
                        label="Note"
                        value={revalueForm.note}
                        onChange={(e) => setRevalueForm({ ...revalueForm, note: e.target.value })}
                        placeholder="e.g. 2026 market appraisal"
                    />
                    {revalueError && (
                        <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600">{revalueError}</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setShowRevalueModal(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={revalueLoading}>
                            Revalue
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Dispose Modal */}
            <Modal
                isOpen={showDisposeModal}
                onClose={() => setShowDisposeModal(false)}
                title="Dispose Asset"
                size="lg"
            >
                <form onSubmit={handleDispose} className="space-y-4">
                    <Select
                        label="Disposal Type"
                        value={disposeForm.disposal_type}
                        onChange={(e) => setDisposeForm({ ...disposeForm, disposal_type: e.target.value })}
                        options={[
                            { value: 'scrapped', label: 'Scrapped — no longer usable, no cash involved' },
                            { value: 'sold', label: 'Sold — enter sale amount, cash in hand increases' },
                        ]}
                        required
                    />
                    <Input
                        label="Disposal Date"
                        type="date"
                        value={disposeForm.disposal_date}
                        onChange={(e) => setDisposeForm({ ...disposeForm, disposal_date: e.target.value })}
                        required
                    />
                    {disposeForm.disposal_type === 'sold' && (
                        <Input
                            label="Sale Amount (PKR)"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={disposeForm.sale_amount}
                            onChange={(e) => setDisposeForm({ ...disposeForm, sale_amount: e.target.value })}
                            required
                        />
                    )}
                    <Input
                        label="Reason"
                        value={disposeForm.reason}
                        onChange={(e) => setDisposeForm({ ...disposeForm, reason: e.target.value })}
                        placeholder={disposeForm.disposal_type === 'scrapped' ? 'e.g. damaged beyond repair' : 'e.g. upgraded to newer model'}
                    />

                    {disposeForm.disposal_type === 'sold' && disposeForm.sale_amount && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-700">
                                ℹ️ Cash in hand will increase by <strong>Rs. {fmt(disposeForm.sale_amount)}</strong>.
                                Gain/loss vs. current worth (Rs. {fmt(asset.current_worth)}) will be computed automatically:{' '}
                                <strong className={parseFloat(disposeForm.sale_amount) - parseFloat(asset.current_worth) >= 0 ? 'text-success-600' : 'text-error-600'}>
                                    Rs. {fmt(parseFloat(disposeForm.sale_amount || 0) - parseFloat(asset.current_worth))}
                                </strong>
                            </p>
                        </div>
                    )}
                    {disposeForm.disposal_type === 'scrapped' && (
                        <div className="p-3 bg-amber-50 rounded-lg">
                            <p className="text-sm text-amber-700">⚠️ No cash movement — this asset will simply be removed from active totals.</p>
                        </div>
                    )}

                    {disposeError && (
                        <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600">{disposeError}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setShowDisposeModal(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="danger" loading={disposeLoading}>
                            Confirm Disposal
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AssetDetailPage;
