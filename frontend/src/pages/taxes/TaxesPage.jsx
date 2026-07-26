import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTaxesStats } from '../../hooks/useTaxes';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const StatBox = ({ label, value, tone = 'neutral', subtitle }) => {
    const tones = {
        neutral: 'text-neutral-900',
        amber: 'text-warning-700',
        red: 'text-error-600',
        blue: 'text-info-600',
        purple: 'text-purple-600',
        green: 'text-success-600',
        orange: 'text-orange-600',
    };
    return (
        <Card className="p-4">
            <p className="text-xs text-neutral-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${tones[tone]}`}>Rs. {fmt(value)}</p>
            {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
        </Card>
    );
};

const TaxesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading } = useTaxesStats();

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view taxes.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Compliance disclaimer — always visible at the top, this is not
                legal/tax advice and figures must be independently verified. */}
            <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl flex gap-3">
                <div className="flex-shrink-0 mt-0.5 text-xl">⚠️</div>
                <div>
                    <p className="text-sm font-semibold text-amber-800">
                        These figures are an internal estimate, not a certified filing.
                    </p>
                    <p className="text-sm text-amber-700 mt-0.5">
                        This page is a development tool and its calculations are not guaranteed to be
                        perfect. Always double-check these numbers and consult a qualified accountant
                        or tax professional before filing or paying anything to FBR. The developer is
                        not responsible for tax decisions made from this page.
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Taxes</h1>
                    <p className="text-neutral-500 mt-1">
                        Sales tax (GST) position and withholding tax (WHT) position — see{' '}
                        <Link to="/reports/sales-tax" className="text-primary-600 hover:text-primary-700">
                            Sales Tax Report
                        </Link>{' '}
                        for a transaction-level breakdown.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link to="/taxes/payments">
                        <Button
                            variant="secondary"
                            icon={({ className }) => (
                                <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            )}
                        >
                            GST Payments
                        </Button>
                    </Link>
                    <Link to="/taxes/wht-payments">
                        <Button
                            icon={({ className }) => (
                                <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            )}
                        >
                            WHT Payments
                        </Button>
                    </Link>
                </div>
            </div>

            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Sales Tax (GST)</h2>
                        <p className="text-sm text-neutral-500 mb-3">
                            Netted — you only owe FBR the difference between what you charged customers and
                            what you already paid your suppliers.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatBox label="Input Tax Paid" value={stats?.total_input_tax_paid} tone="blue" subtitle="GST paid to suppliers" />
                            <StatBox label="Output Tax Collected" value={stats?.total_output_tax_collected} tone="purple" subtitle="GST charged to customers" />
                            <StatBox label="Net Sales Tax Payable" value={stats?.net_sales_tax_payable} tone="amber" subtitle="Output minus Input tax" />
                            <StatBox label="Sales Tax Outstanding" value={stats?.sales_tax_outstanding} tone="red" subtitle="Still to pay FBR" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            <StatBox label="Sales Tax Paid" value={stats?.total_sales_tax_paid} tone="green" subtitle="Actually paid to FBR so far" />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 mb-3 mt-2">Withholding Tax (WHT)</h2>
                        <p className="text-sm text-neutral-500 mb-3">
                            Never netted against Sales Tax, or against each other — each side belongs to a
                            different taxpayer's obligation. Only the supplier side (money you're holding)
                            is something you actually pay.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatBox label="WHT Withheld from Suppliers" value={stats?.total_wht_withheld_from_suppliers} tone="orange" subtitle="Input side — real FBR liability" />
                            <StatBox label="WHT Withheld by Customers" value={stats?.total_wht_withheld_by_customers} tone="blue" subtitle="Output side — credit only, not payable" />
                            <StatBox label="WHT Paid" value={stats?.total_wht_paid} tone="green" subtitle="Actually deposited to FBR so far" />
                            <StatBox label="WHT Outstanding" value={stats?.wht_outstanding} tone="red" subtitle="Withheld from suppliers minus paid" />
                        </div>
                    </div>
                </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">GST Payments</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Record and manage every GST payment actually made to FBR — each one reduces cash in hand.
                    </p>
                    <Link to="/taxes/payments">
                        <Button variant="secondary">View GST Payments →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">WHT Payments</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Record and manage every WHT deposit actually made to FBR, against tax withheld from
                        suppliers — each one reduces cash in hand.
                    </p>
                    <Link to="/taxes/wht-payments">
                        <Button variant="secondary">View WHT Payments →</Button>
                    </Link>
                </Card>
            </div>
        </div>
    );
};

export default TaxesPage;
