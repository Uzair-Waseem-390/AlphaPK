import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBackupStats } from '../../hooks/useBackups';
import { backupsApi } from '../../services/backupsApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmtDate = (value) => value ? new Date(value).toLocaleString() : 'Never';

const RESULT_INITIAL = { key: null, error: '', info: null };

const BackupPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading, refetch: refetchStats } = useBackupStats();
    const [runningKey, setRunningKey] = useState(null);
    const [result, setResult] = useState(RESULT_INITIAL);

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const runBackup = async (key, fn, { isDownload }) => {
        setRunningKey(key);
        setResult(RESULT_INITIAL);
        try {
            const res = await fn();
            setResult({
                key,
                error: '',
                info: isDownload
                    ? { message: 'Backup downloaded successfully.' }
                    : {
                        message: res.schema_migrated
                            ? 'Remote schema was behind — migrated, and ran as a FULL backup instead.'
                            : 'Remote backup completed.',
                        rowCount: res.row_count,
                        backupType: res.backup_type,
                    },
            });
        } catch (err) {
            setResult({ key, error: err.message || 'Backup failed', info: null });
        } finally {
            setRunningKey(null);
            refetchStats();
        }
    };

    const cards = [
        {
            key: 'fullLocal',
            title: 'Full Backup — Local',
            description: 'Every row in the system, from day one to now. Downloads as a zip file — nothing is kept on the server.',
            icon: '💾',
            action: () => runBackup('fullLocal', backupsApi.fullLocal, { isDownload: true }),
        },
        {
            key: 'incrementalLocal',
            title: 'Incremental Backup — Local',
            description: 'Only rows changed since the last local backup. Downloads as a zip file.',
            icon: '📥',
            action: () => runBackup('incrementalLocal', backupsApi.incrementalLocal, { isDownload: true }),
        },
        {
            key: 'fullRemote',
            title: 'Full Backup — Remote',
            description: 'Every row, migrated and loaded directly into the configured remote database.',
            icon: '☁️',
            action: () => runBackup('fullRemote', backupsApi.fullRemote, { isDownload: false }),
        },
        {
            key: 'incrementalRemote',
            title: 'Incremental Backup — Remote',
            description: 'Only rows changed since the last remote backup, loaded into the remote database.',
            icon: '🔄',
            action: () => runBackup('incrementalRemote', backupsApi.incrementalRemote, { isDownload: false }),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Backups</h1>
                    <p className="text-neutral-500 mt-1">
                        Create a full or incremental backup, locally or to a remote database.
                    </p>
                </div>
                <Link to="/backups/history">
                    <Button variant="secondary">View History</Button>
                </Link>
            </div>

            {statsLoading ? (
                <LoadingSpinner size="md" />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Last Local Backup</p>
                        <p className="text-lg font-semibold text-neutral-900">{fmtDate(stats?.local_last_backup_at)}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Last Remote Backup</p>
                        <p className="text-lg font-semibold text-neutral-900">{fmtDate(stats?.remote_last_backup_at)}</p>
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cards.map((card) => (
                    <Card key={card.key} className="p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <span className="text-2xl">{card.icon}</span>
                                <h2 className="text-lg font-semibold text-neutral-900 mt-2">{card.title}</h2>
                                <p className="text-sm text-neutral-500 mt-1">{card.description}</p>
                            </div>
                        </div>
                        <Button
                            className="mt-4"
                            loading={runningKey === card.key}
                            disabled={runningKey !== null && runningKey !== card.key}
                            onClick={card.action}
                        >
                            Run Backup
                        </Button>

                        {result.key === card.key && result.error && (
                            <div className="mt-4 p-3 bg-error-50 border border-error-200 rounded-lg">
                                <p className="text-sm text-error-600">{result.error}</p>
                            </div>
                        )}
                        {result.key === card.key && result.info && (
                            <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg">
                                <p className="text-sm text-success-700">{result.info.message}</p>
                                {result.info.rowCount != null && (
                                    <p className="text-xs text-success-600 mt-1">
                                        {result.info.rowCount} rows · type: {result.info.backupType}
                                    </p>
                                )}
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default BackupPage;
