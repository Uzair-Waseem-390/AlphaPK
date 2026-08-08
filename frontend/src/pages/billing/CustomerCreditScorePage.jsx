import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { creditScoreApi } from '../../services/creditScoreApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

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

    const {
        data: history, meta, page, setPage, loading: historyLoading,
    } = usePaginatedList((params) => creditScoreApi.customers.getHistory(id, params), {}, 20, [id]);

    useEffect(() => {
        fetchScore();
    }, [id]);

    const fetchScore = async () => {
        setLoading(true);
        try {
            const data = await creditScoreApi.customers.getById(id);
            setScoreData(data);
        } catch (error) {
            console.error('Failed to fetch credit score:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!scoreData) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Credit Score Not Found</h2>
                <Link to={`/billing/customers/${id}`} className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Customer
                </Link>
            </div>
        );
    }

    const breakdown = scoreData.factor_breakdown || {};
    const factors = breakdown.factors || null;

    return (
        <div className="space-y-6">
            <div>
                <Link to={`/billing/customers/${id}`} className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to {scoreData.customer_name}
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Credit Score</h1>
                <p className="text-neutral-500">{scoreData.customer_name} ({scoreData.customer_code})</p>
            </div>

            <Card className="p-6">
                <div className="flex items-center gap-6">
                    <div>
                        <p className="text-sm text-neutral-500">Current Score</p>
                        <p className="text-5xl font-bold text-neutral-900">{scoreData.score}</p>
                    </div>
                    <Badge variant={TIER_BADGE_VARIANT[scoreData.tier] || 'default'} className="text-base px-4 py-1.5">
                        {scoreData.tier_display}
                    </Badge>
                    <div className="ml-auto text-right">
                        <p className="text-sm text-neutral-500">Last Calculated</p>
                        <p className="font-medium">{new Date(scoreData.last_calculated_at).toLocaleString()}</p>
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Score Breakdown</h3>
                {!factors ? (
                    <p className="text-neutral-500">{breakdown.note || 'No breakdown available yet.'}</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-neutral-500">Baseline</p>
                                <p className="font-medium">{breakdown.baseline}</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Confidence</p>
                                <p className="font-medium">{(breakdown.confidence * 100).toFixed(0)}%</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Confirmed Invoices</p>
                                <p className="font-medium">{breakdown.confirmed_invoice_count}</p>
                            </div>
                            <div>
                                <p className="text-neutral-500">Net Adjustment</p>
                                <p className="font-medium">
                                    {breakdown.scaled_delta > 0 ? '+' : ''}{breakdown.scaled_delta?.toFixed(1)}
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
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
                                            <td className="px-3 py-2">{FACTOR_LABELS[key] || key}</td>
                                            <td className="px-3 py-2 text-right">{(factor.ratio * 100).toFixed(1)}%</td>
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

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">History</h3>
                {historyLoading ? (
                    <div className="flex justify-center py-8">
                        <LoadingSpinner size="md" />
                    </div>
                ) : history.length === 0 ? (
                    <p className="text-center text-neutral-500 py-4">No history yet.</p>
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
