import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import { cashFlowApi } from '../../services/cashFlowApi';

const formatCurrency = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return 'Rs. 0';
    if (Math.abs(num) >= 1000000) return `Rs. ${(num / 1000000).toFixed(1)}M`;
    if (Math.abs(num) >= 1000) return `Rs. ${(num / 1000).toFixed(1)}K`;
    return `Rs. ${num.toFixed(0)}`;
};

const formatMonthLabel = (month) => {
    const [year, m] = month.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
        <div className="bg-white rounded-xl shadow-card-hover border border-neutral-200 p-3">
            <p className="text-sm font-semibold text-neutral-900">{formatMonthLabel(label)}</p>
            <p className="text-xs text-neutral-500 mt-1">
                Revenue: <span className="font-medium text-neutral-700">{formatCurrency(data.revenue)}</span>
            </p>
            <p className="text-xs text-neutral-500">
                COGS: <span className="font-medium text-neutral-700">{formatCurrency(data.cogs)}</span>
            </p>
            <p className="text-xs text-success-600 font-semibold mt-1">
                Gross Profit: {formatCurrency(data.gross_profit)}
            </p>
        </div>
    );
};

CustomTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.array,
    label: PropTypes.string,
};

const GrossProfitTrendChart = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [appliedFilters, setAppliedFilters] = useState({});

    const fetchTrend = async (params) => {
        setLoading(true);
        setError('');
        try {
            const result = await cashFlowApi.grossProfitTrend.get(params);
            setData(result || []);
        } catch (err) {
            setError(err.message || 'Failed to load gross profit trend');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrend(appliedFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedFilters]);

    const handleApply = () => {
        const params = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        setAppliedFilters(params);
    };

    const handleReset = () => {
        setDateFrom('');
        setDateTo('');
        setAppliedFilters({});
    };

    const isFiltered = Object.keys(appliedFilters).length > 0;

    return (
        <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-900">Gross Profit Trend</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                        {isFiltered ? 'Custom range' : 'Last 6 months'}
                    </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <Input
                        label="From"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-40"
                    />
                    <Input
                        label="To"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-40"
                    />
                    <Button size="sm" onClick={handleApply}>Apply</Button>
                    {isFiltered && (
                        <Button size="sm" variant="secondary" onClick={handleReset}>Reset</Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 bg-error-50 border border-error-200 rounded-lg mb-4">
                    <p className="text-sm text-error-600">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-72">
                    <LoadingSpinner size="lg" />
                </div>
            ) : data.length === 0 ? (
                <div className="flex items-center justify-center h-72">
                    <p className="text-sm text-neutral-500">No data for this range</p>
                </div>
            ) : (
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="grossProfitGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis
                                dataKey="month"
                                tickFormatter={formatMonthLabel}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                axisLine={{ stroke: '#e2e8f0' }}
                                tickLine={false}
                            />
                            <YAxis
                                tickFormatter={formatCurrency}
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={70}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="gross_profit"
                                stroke="#059669"
                                strokeWidth={2}
                                fill="url(#grossProfitGradient)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
};

export default GrossProfitTrendChart;
