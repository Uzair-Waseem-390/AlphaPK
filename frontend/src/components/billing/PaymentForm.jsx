import { useState } from 'react';
import PropTypes from 'prop-types';
import { Banknote, Calendar, StickyNote } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';
import { todayLocalDate } from '../../utils/helpers';

// `apiErrors` carries field-specific backend validation errors (e.g. the
// over-payment check keys its message under "amount"), while `apiError`
// carries non-field errors (e.g. "Cannot record payment on a draft
// invoice."). Both are optional and set by the parent page after a failed
// submit; `onDismissApiError` lets this form clear stale server errors the
// moment the user edits a field again.
const PaymentForm = ({ onSubmit, onCancel, loading, maxAmount, apiErrors, apiError, onDismissApiError }) => {
    const [formData, setFormData] = useState({
        amount: '',
        method: 'cash',
        payment_date: todayLocalDate(),
        note: '',
    });
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
        onDismissApiError?.();
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const amount = parseFloat(formData.amount);

        if (!amount || amount <= 0) {
            setError('Amount must be greater than 0');
            return;
        }

        if (maxAmount !== undefined && amount > maxAmount) {
            setError(`Amount cannot exceed outstanding balance of ${maxAmount.toFixed(2)}`);
            return;
        }

        onSubmit({
            ...formData,
            amount: amount,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {apiError && <InlineAlert variant="error" message={apiError} />}

            <Input
                label="Amount"
                type="number"
                step="0.01"
                min="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Enter amount"
                icon={Banknote}
                error={error || apiErrors?.amount}
                required
            />
            {maxAmount !== undefined && (
                <p className="text-xs text-neutral-500">
                    Max allowed: {maxAmount.toFixed(2)} (outstanding balance)
                </p>
            )}

            <Select
                label="Payment Method"
                name="method"
                value={formData.method}
                onChange={handleChange}
                error={apiErrors?.method}
                options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'jazzcash', label: 'JazzCash' },
                    { value: 'easypaisa', label: 'Easypaisa' },
                    { value: 'bank', label: 'Bank Transfer' },
                ]}
                required
            />

            <Input
                label="Payment Date"
                type="date"
                name="payment_date"
                value={formData.payment_date}
                onChange={handleChange}
                icon={Calendar}
                required
            />

            <Input
                label="Note"
                name="note"
                value={formData.note}
                onChange={handleChange}
                placeholder="Payment note (optional)"
                icon={StickyNote}
            />

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" loading={loading}>
                    Record Payment
                </Button>
            </div>
        </form>
    );
};

PaymentForm.propTypes = {
    onSubmit: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    loading: PropTypes.bool,
    maxAmount: PropTypes.number,
    apiErrors: PropTypes.shape({
        amount: PropTypes.string,
        method: PropTypes.string,
    }),
    apiError: PropTypes.string,
    onDismissApiError: PropTypes.func,
};

export default PaymentForm;
