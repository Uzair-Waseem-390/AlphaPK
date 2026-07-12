import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import PaymentStatusBadge from '../../components/billing/PaymentStatusBadge';

const CustomerDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [customer, setCustomer] = useState(null);
    const [outstandingSummary, setOutstandingSummary] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [customerData, summaryData, invoicesData] = await Promise.all([
                billingApi.customers.getById(id),
                billingApi.customers.getOutstandingSummary(id),
                billingApi.invoices.getAll({ customer_id: id, page_size: 500 }),
            ]);

            setCustomer(customerData);
            setOutstandingSummary(summaryData);
            setInvoices(invoicesData?.results ?? invoicesData ?? []);
        } catch (error) {
            console.error('Failed to fetch customer details:', error);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { key: 'bill_number', label: 'Bill #', width: '120px' },
        {
            key: 'grand_total',
            label: 'Grand Total (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'credit_outstanding',
            label: 'Outstanding (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'payment_status',
            label: 'Payment Status',
            render: (value) => <PaymentStatusBadge status={value} />
        },
        {
            key: 'status',
            label: 'Invoice Status',
            render: (value) => {
                const variants = {
                    draft: 'draft',
                    confirmed: 'confirmed',
                    partial: 'warning',
                    returned: 'info',
                };
                const labels = {
                    draft: 'Draft',
                    confirmed: 'Confirmed',
                    partial: 'Partial Return',
                    returned: 'Returned',
                };
                return <Badge variant={variants[value] || 'default'}>{labels[value] || value}</Badge>;
            }
        },
        {
            key: 'confirmed_at',
            label: 'Confirmed',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        {
            key: 'id',
            label: 'Actions',
            width: '100px',
            render: (_, row) => (
                <Link
                    to={`/billing/invoices/${row.id}`}
                    className="text-primary-600 hover:text-primary-700 text-sm"
                >
                    View
                </Link>
            ),
        },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Customer Not Found</h2>
                <Link to="/billing/customers" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Customers
                </Link>
            </div>
        );
    }

    const activeInvoices = invoices.filter(inv => inv.status !== 'draft');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/billing/customers" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Customers
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">{customer.name}</h1>
                    <p className="text-neutral-500">Code: {customer.code}</p>
                </div>
                <Link to="/billing/customers">
                    <Button variant="secondary">
                        ← Back to Customers
                    </Button>
                </Link>
            </div>

            {/* Customer Info */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Name</p>
                        <p className="font-medium">{customer.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Code</p>
                        <p className="font-medium">{customer.code}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Address</p>
                        <p className="font-medium">{customer.address}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Mobile</p>
                        <p className="font-medium">{customer.mobile || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created</p>
                        <p className="font-medium">{new Date(customer.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Status</p>
                        <Badge variant={customer.is_deleted ? 'error' : 'success'}>
                            {customer.is_deleted ? 'Deleted' : 'Active'}
                        </Badge>
                    </div>
                </div>
            </Card>

            {/* Outstanding Summary */}
            {outstandingSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Total Billed</p>
                        <p className="text-xl font-bold text-neutral-900">
                            {typeof outstandingSummary.total_billed === 'string'
                                ? parseFloat(outstandingSummary.total_billed).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Total Paid</p>
                        <p className="text-xl font-bold text-success-600">
                            {typeof outstandingSummary.total_paid === 'string'
                                ? parseFloat(outstandingSummary.total_paid).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Credit Outstanding</p>
                        <p className="text-xl font-bold text-error-600">
                            {typeof outstandingSummary.total_credit_outstanding === 'string'
                                ? parseFloat(outstandingSummary.total_credit_outstanding).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Payment Status</p>
                        {outstandingSummary.total_credit_outstanding && parseFloat(outstandingSummary.total_credit_outstanding) > 0 ? (
                            <Badge variant="unpaid">Outstanding</Badge>
                        ) : (
                            <Badge variant="paid">Settled</Badge>
                        )}
                    </Card>
                </div>
            )}

            {/* Invoice History */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Invoice History</h3>
                {activeInvoices.length === 0 ? (
                    <p className="text-center text-neutral-500 py-4">No confirmed invoices for this customer</p>
                ) : (
                    <Table
                        columns={columns}
                        data={activeInvoices}
                    />
                )}
            </Card>

            {/* All Invoices (including drafts) */}
            {invoices.length > activeInvoices.length && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Draft Invoices</h3>
                    {invoices.filter(inv => inv.status === 'draft').length === 0 ? (
                        <p className="text-center text-neutral-500 py-4">No draft invoices</p>
                    ) : (
                        <Table
                            columns={columns}
                            data={invoices.filter(inv => inv.status === 'draft')}
                        />
                    )}
                </Card>
            )}
        </div>
    );
};

export default CustomerDetailPage;