import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBackupHistory } from '../../hooks/useBackups';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmtDate = (value) => value ? new Date(value).toLocaleString() : 'N/A';

const columns = [
    {
        key: 'backup_type',
        label: 'Type',
        render: (v) => <Badge variant={v === 'full' ? 'info' : 'default'}>{v === 'full' ? 'Full' : 'Incremental'}</Badge>,
    },
    {
        key: 'destination',
        label: 'Destination',
        render: (v) => <Badge variant={v === 'remote' ? 'warning' : 'default'}>{v === 'remote' ? 'Remote' : 'Local'}</Badge>,
    },
    {
        key: 'status',
        label: 'Status',
        render: (v) => <Badge variant={v === 'success' ? 'success' : 'error'}>{v === 'success' ? 'Success' : 'Failed'}</Badge>,
    },
    { key: 'covers_from', label: 'Covers From', render: fmtDate },
    { key: 'covers_to', label: 'Covers To', render: fmtDate },
    { key: 'row_count', label: 'Rows' },
    {
        key: 'schema_migrated',
        label: 'Schema Migrated',
        render: (v) => v ? <Badge variant="warning">Yes</Badge> : <span className="text-neutral-400">No</span>,
    },
    { key: 'triggered_by', label: 'Triggered By', render: (v) => v || 'N/A' },
    { key: 'created_at', label: 'Ran At', render: fmtDate },
    { key: 'error_message', label: 'Error', render: (v) => v || <span className="text-neutral-300">—</span> },
];

const BackupHistoryPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, meta, loading, page, setPage } = useBackupHistory();

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    return (
        <div className="space-y-6">
            <div>
                <Link to="/backups" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Backups
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Backup History</h1>
                <p className="text-neutral-500 mt-1">Every backup run ever attempted, newest first.</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size="lg" />
                </div>
            ) : data.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🗄️</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Backups Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Run a backup from the Backups page to see it here.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={data} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default BackupHistoryPage;
