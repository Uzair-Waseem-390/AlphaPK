import { useState } from 'react';
import PropTypes from 'prop-types';
import { Wallet } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import InlineAlert from '../ui/InlineAlert';

const PaymentForm = ({ onSubmit, onCancel, loading, maxAmount }) => {
    const [formData, setFormData] = useState({
        amount: '',
        method: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
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
            <Input
                label="Amount (PKR)"
                type="number"
                step="0.01"
                min="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Enter amount"
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
                required
            />

            <Input
                label="Note"
                name="note"
                value={formData.note}
                onChange={handleChange}
                placeholder="Payment note (optional)"
            />

            {error && <InlineAlert variant="error" message={error} />}

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" loading={loading} icon={Wallet}>
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
};

export default PaymentForm;
