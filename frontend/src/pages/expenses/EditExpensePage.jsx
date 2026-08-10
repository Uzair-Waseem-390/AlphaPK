import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Info, PenSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/errorMessage';
import { cashFlowApi } from '../../services/cashFlowApi';
import { useAllExpenseCategories, useCashFlowStats } from '../../hooks/useCashFlow';
import BackLink from '../../components/ui/BackLink';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import InlineAlert from '../../components/ui/InlineAlert';
import EmptyState from '../../components/ui/EmptyState';

const EXPENSE_FIELDS = ['name', 'category', 'amount', 'expense_date', 'description'];

const splitApiErrors = (error, fieldNames) => {
    const data = error?.response?.data;
    const fieldErrors = {};
    let generalMessage = null;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
        Object.keys(data).forEach((key) => {
            const val = Array.isArray(data[key]) ? data[key][0] : data[key];
            if (fieldNames.includes(key)) {
                fieldErrors[key] = val;
            } else if (!generalMessage) {
                generalMessage = val;
            }
        });
    }

    if (!generalMessage && Object.keys(fieldErrors).length === 0) {
        generalMessage = extractErrorMessage(error, 'Failed to update expense');
    }

    return { fieldErrors, generalMessage };
};

const EditExpensePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: categories, loading: categoriesLoading } = useAllExpenseCategories();
    const { refetch: refetchStats } = useCashFlowStats();

    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [expense, setExpense] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        amount: '',
        expense_date: '',
        description: '',
    });
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        fetchExpense();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchExpense = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const expensesRes = await cashFlowApi.expenses.getAll({ page_size: 500 });
            const expenses = expensesRes?.results ?? expensesRes ?? [];
            const found = expenses.find(e => e.id === parseInt(id));
            if (found) {
                setExpense(found);
                setFormData({
                    name: found.name || '',
                    category: found.category?.id || '',
                    amount: found.amount || '',
                    expense_date: found.expense_date || '',
                    description: found.description || '',
                });
            } else {
                setExpense(null);
            }
        } catch (error) {
            console.error('Failed to fetch expense:', error);
            setExpense(null);
            setFetchError(extractErrorMessage(error, 'Failed to load expense'));
        } finally {
            setLoading(false);
        }
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError(null);
        if (!validate()) return;

        setSaving(true);
        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount),
                category: parseInt(formData.category, 10),
            };
            await cashFlowApi.expenses.update(id, data);
            refetchStats();
            toast.success('Expense updated successfully');
            navigate(`/expenses/${id}`);
        } catch (error) {
            console.error('Failed to update expense:', error);
            const { fieldErrors, generalMessage } = splitApiErrors(error, EXPENSE_FIELDS);
            setErrors((prev) => ({ ...prev, ...fieldErrors }));
            if (generalMessage) {
                setFormError(generalMessage);
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading || categoriesLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="space-y-6">
                <BackLink to="/expenses">Back to Expenses</BackLink>
                <InlineAlert variant="error" message={fetchError} onRetry={fetchExpense} />
            </div>
        );
    }

    if (!expense) {
        return (
            <div className="space-y-6">
                <BackLink to="/expenses">Back to Expenses</BackLink>
                <EmptyState
                    title="Expense not found"
                    description="The expense you're trying to edit doesn't exist or may have been deleted."
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div>
                    <BackLink to={`/expenses/${id}`}>Back to Expense</BackLink>
                    <div className="flex items-center gap-3 mt-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-700 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-900/20 flex-shrink-0">
                            <PenSquare className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Edit Expense</h1>
                            <p className="text-neutral-500 text-sm sm:text-base">Update expense details</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => navigate(`/expenses/${id}`)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} loading={saving}>
                        Update Expense
                    </Button>
                </div>
            </motion.div>

            <Card className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formError && <InlineAlert variant="error" message={formError} />}

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
                        error={errors.description}
                    />

                    <div className="flex items-start gap-2.5 p-3 bg-info-50 rounded-xl border border-info-100">
                        <Info className="w-4 h-4 text-info-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-info-700">
                            Updating the amount will adjust cash in hand by the difference.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => navigate(`/expenses/${id}`)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={saving}>
                            Update Expense
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default EditExpensePage;
