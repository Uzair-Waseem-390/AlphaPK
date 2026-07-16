import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';

const REPORTS = [
    {
        title: 'Invoices Report',
        description: 'Total invoices and their value for a selected date range',
        icon: '🧾',
        path: '/reports/invoices',
    },
    {
        title: 'Cash Collected Report',
        description: 'Total cash collected from customers for a selected date range',
        icon: '💵',
        path: '/reports/cash-collected',
    },
    {
        title: 'Expenses Report',
        description: 'Total expenses and their value for a selected date range',
        icon: '💸',
        path: '/reports/expenses',
    },
    {
        title: 'Lost Inventory Report',
        description: 'Products marked as lost, damaged, or missing for a selected date range',
        icon: '📉',
        path: '/reports/lost-inventory',
    },
];

const ReportsHomePage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Reports</h1>
                <p className="text-neutral-500 mt-1">Business reports and analytics</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {REPORTS.map((report) => (
                    <Card
                        key={report.path}
                        className="cursor-pointer hover:shadow-card-hover transition-shadow"
                        onClick={() => navigate(report.path)}
                    >
                        <div className="text-4xl mb-3">{report.icon}</div>
                        <h3 className="text-lg font-semibold text-neutral-900">{report.title}</h3>
                        <p className="text-sm text-neutral-500 mt-1">{report.description}</p>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default ReportsHomePage;
