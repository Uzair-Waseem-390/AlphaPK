import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

const ExpenseForm = ({ initialData, categories, onSubmit, onCancel, loading }) => {
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        description: '',
    });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                category: initialData.category?.id || '',
                amount: initialData.amount || '',
                expense_date: initialData.expense_date || new Date().toISOString().split('T')[0],
                description: initialData.description || '',
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.name) newErrors.name = 'Name is required';
        if (!formData.category) newErrors.category = 'Category is required';
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            newErrors.amount = 'Amount must be greater than 0';
        }
        if (!formData.expense_date) newErrors.expense_date = 'Date is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            onSubmit({
                ...formData,
                amount: parseFloat(formData.amount),
                category: parseInt(formData.category),
            });
        }
    };

    const isEdit = !!initialData;

    return (
        <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSubmit}
            className="space-y-4"
        >
            <Input
                label="Expense Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter expense name"
                error={errors.name}
                required
            />

            <Select
                label="Category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                options={[
                    { value: '', label: 'Select category' },
                    ...categories.map(c => ({ value: c.id, label: c.name })),
                ]}
                error={errors.category}
                required
            />

            <Input
                label="Amount (PKR)"
                type="number"
                step="0.01"
                min="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Enter amount"
                error={errors.amount}
                required
            />

            <Input
                label="Expense Date"
                type="date"
                name="expense_date"
                value={formData.expense_date}
                onChange={handleChange}
                error={errors.expense_date}
                required
            />

            <Input
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Enter description (optional)"
            />

            {!isEdit && formData.amount && parseFloat(formData.amount) > 0 && (
                <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm text-amber-700">
                        ⚠️ This expense will deduct <strong>Rs. {parseFloat(formData.amount).toFixed(2)}</strong> from cash in hand
                    </p>
                </div>
            )}

            {isEdit && formData.amount && parseFloat(formData.amount) > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                        ℹ️ Updating amount will adjust cash in hand by the difference
                    </p>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" loading={loading}>
                    {isEdit ? 'Update Expense' : 'Create Expense'}
                </Button>
            </div>
        </motion.form>
    );
};

ExpenseForm.propTypes = {
    initialData: PropTypes.object,
    categories: PropTypes.array.isRequired,
    onSubmit: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    loading: PropTypes.bool,
};

export default ExpenseForm;