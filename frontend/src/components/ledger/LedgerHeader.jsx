import PropTypes from 'prop-types';
import BalanceDisplay from './BalanceDisplay';

const LedgerHeader = ({ ledger, closingBalance }) => {
    const getBalanceStatus = (balance) => {
        const num = typeof balance === 'string' ? parseFloat(balance) : balance;
        if (isNaN(num)) return { text: 'Settled', color: 'text-neutral-500' };
        if (num === 0) return { text: 'Settled', color: 'text-neutral-500' };
        if (num > 0) return { text: 'Payable', color: 'text-error-600' };
        return { text: 'Credit', color: 'text-success-600' };
    };

    const status = getBalanceStatus(closingBalance);

    return (
        <div className="bg-white rounded-xl shadow-card p-6 border border-neutral-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
                <div>
                    <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Company</p>
                    <h1 className="text-3xl font-bold text-neutral-900">{import.meta.env.VITE_APP_NAME}</h1>
                    <div className="mt-2">
                        <h2 className="text-xl font-semibold text-neutral-900">{ledger?.supplier_name}</h2>
                        <p className="text-sm text-neutral-500">Code: {ledger?.supplier_code}</p>
                        <p className="text-sm text-neutral-500">
                            Account since: {ledger?.created_at ? new Date(ledger.created_at).toLocaleDateString() : 'N/A'}
                        </p>
                    </div>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                    <p className="text-sm text-neutral-500">Currency</p>
                    <p className="text-xl font-semibold text-neutral-900">PKR</p>
                    <div className="mt-2">
                        <p className="text-sm text-neutral-500">Closing Balance</p>
                        <div className="text-2xl font-bold">
                            <BalanceDisplay balance={closingBalance} />
                        </div>
                        <p className={`text-sm font-medium ${status.color}`}>
                            {status.text}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

LedgerHeader.propTypes = {
    ledger: PropTypes.object,
    closingBalance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default LedgerHeader;