import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { History } from 'lucide-react';
import { creditScoreApi } from '../../services/creditScoreApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { extractErrorMessage } from '../../utils/errorMessage';
import BackLink from '../../components/ui/BackLink';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import InlineAlert from '../../components/ui/InlineAlert';
import EmptyState from '../../components/ui/EmptyState';

const TIER_BADGE_VARIANT = {
    good: 'success',
    average: 'warning',
    poor: 'error',
};

const FACTOR_LABELS = {
    payment_completion_rate: 'Payment Completion Rate',
    overdue_ratio: 'Overdue Balance Ratio',
    outstanding_ratio: 'Outstanding (Not Yet Due) Ratio',
    return_ratio: 'Returns Ratio',
    advance_usage_ratio: 'Advance Payment Usage',
};

const historyColumns = [
    {
        key: 'created_at',
        label: 'Date',
        render: (value) => new Date(value).toLocaleString(),
    },
    { key: 'trigger', label: 'Event' },
    { key: 'reference', label: 'Reference', render: (value) => value || '—' },
    {
        key: 'score_before',
        label: 'Score Before → After',
        render: (value, row) => `${value ?? '—'} → ${row.score_after}`,
    },
    {
        key: 'delta',
        label: 'Change',
        render: (value) => value === null || value === undefined ? '—' : (
            <span className={value > 0 ? 'text-success-600' : value < 0 ? 'text-error-600' : 'text-neutral-500'}>
                {value > 0 ? `+${value}` : value}
            </span>
        ),
    },
];

const CustomerCreditScorePage = () => {
    const { id } = useParams();
    const [scoreData, setScoreData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const {
        data: history, meta, page, setPage, loading: historyLoading, error: historyError, refetch: refetchHistory,
    } = usePaginatedList((params) => creditScoreApi.customers.getHistory(id, params), {}, 20, [id]);

    const fetchScore = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await creditScoreApi.customers.getById(id);
            setScoreData(data);
        } catch (err) {
            setError(extractErrorMessage(err, 'Failed to load credit score.'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchScore();
    }, [fetchScore]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <BackLink to={`/billing/customers/${id}`}>Back to Customer</BackLink>
                <InlineAlert variant="error" title="Failed to load credit score" message={error} onRetry={fetchScore} />
            </div>
        );
    }

    if (!scoreData) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Credit Score Not Found</h2>
                <BackLink to={`/billing/customers/${id}`} className="mt-4">Back to Customer</BackLink>
            </div>
        );
    }

    const breakdown = scoreData.factor_breakdown || {};
    const factors = breakdown.factors || null;

    return (
        <div className="space-y-6">
            <div>
                <BackLink to={`/billing/customers/${id}`}>Back to {scoreData.customer_name}</BackLink>
                <h1 className="text-3xl font-bold text-neutral-900 mt-2">Credit Score</h1>
                <p className="text-neutral-500">{scoreData.customer_name} ({scoreData.customer_code})</p>
            </div>

            <Card className="p-6" hover={false}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                    <div>
                        <p className="text-sm text-neutral-500">Current Score</p>
                        <p className="text-5xl font-bold text-neutral-900">{scoreData.score}</p>
                    </div>
                    <Badge variant={TIER_BADGE_VARIANT[scoreData.tier] || 'default'} className="text-base px-4 py-1.5 w-fit">
                        {scoreData.tier_display}
                    </Badge>
                    <div className="sm:ml-auto text-left sm:text-right">
                        <p className="text-sm text-neutral-500">Last Calculated</p>
                        <p className="font-medium text-neutral-900">{new Date(scoreData.last_calculated_at).toLocaleString()}</p>
                    </div>
                </div>
            </Card>

            <Card className="p-6" hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Score Breakdown</h3>
                {!factors ? (
                    <p className="text-neutral-500">{breakdown.note || 'No breakdown available yet.'}</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-neutral-500">Baseline</p>
                                <p className="font-medium text-neutral-900">{breakdown.baseline}</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Confidence</p>
                                <p className="font-medium text-neutral-900">{(breakdown.confidence * 100).toFixed(0)}%</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Confirmed Invoices</p>
                                <p className="font-medium text-neutral-900">{breakdown.confirmed_invoice_count}</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Net Adjustment</p>
                                <p className="font-medium text-neutral-900">
                                    {breakdown.scaled_delta > 0 ? '+' : ''}{breakdown.scaled_delta?.toFixed(1)}
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto -mx-2 px-2">
                            <table className="w-full text-sm min-w-[480px]">
                                <thead>
                                    <tr className="border-b border-neutral-200">
                                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Factor</th>
                                        <th className="px-3 py-2 text-right font-medium text-neutral-500">Ratio</th>
                                        <th className="px-3 py-2 text-right font-medium text-neutral-500">Points (before confidence)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {Object.entries(factors).map(([key, factor]) => (
                                        <tr key={key}>
                                            <td className="px-3 py-2 text-neutral-700">{FACTOR_LABELS[key] || key}</td>
                                            <td className="px-3 py-2 text-right text-neutral-700">{(factor.ratio * 100).toFixed(1)}%</td>
                                            <td className={`px-3 py-2 text-right font-medium ${factor.points > 0 ? 'text-success-600' : factor.points < 0 ? 'text-error-600' : 'text-neutral-500'}`}>
                                                {factor.points > 0 ? '+' : ''}{factor.points.toFixed(1)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Card>

            <Card className="p-6" hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">History</h3>
                {historyLoading ? (
                    <div className="flex justify-center py-8">
                        <LoadingSpinner size="md" />
                    </div>
                ) : historyError ? (
                    <InlineAlert variant="error" message={historyError} onRetry={refetchHistory} />
                ) : history.length === 0 ? (
                    <EmptyState
                        icon={<History className="w-8 h-8 text-neutral-400" />}
                        title="No history yet"
                        description="Score-changing events for this customer will appear here."
                    />
                ) : (
                    <>
                        <Table columns={historyColumns} data={history} />
                        {meta.totalPages > 1 && (
                            <div className="mt-4">
                                <Pagination
                                    currentPage={meta.currentPage}
                                    totalPages={meta.totalPages}
                                    onPageChange={setPage}
                                />
                            </div>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
};

export default CustomerCreditScorePage;
