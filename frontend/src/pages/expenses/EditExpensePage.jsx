import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cashFlowApi } from '../../services/cashFlowApi';
import { useAllExpenseCategories, useCashFlowStats } from '../../hooks/useCashFlow';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const EditExpensePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: categories, loading: categoriesLoading } = useAllExpenseCategories();
    const { refetch: refetchStats } = useCashFlowStats();

    const [loading, setLoading] = useState(true);
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

    useEffect(() => {
        fetchExpense();
    }, [id]);

    const fetchExpense = async () => {
        setLoading(true);
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
            }
        } catch (error) {
            console.error('Failed to fetch expense:', error);
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
        if (!validate()) return;

        setSaving(true);
        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount),
                category: parseInt(formData.category),
            };
            await cashFlowApi.expenses.update(id, data);
            refetchStats();
            navigate(`/expenses/${id}`);
        } catch (error) {
            console.error('Failed to update expense:', error);
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

    if (!expense) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Expense Not Found</h2>
                <Link to="/expenses" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Expenses
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to={`/expenses/${id}`} className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Expense
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Edit Expense</h1>
                    <p className="text-neutral-500">Update expense details</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => navigate(`/expenses/${id}`)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} loading={saving}>
                        Update Expense
                    </Button>
                </div>
            </div>

            <Card className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
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

                    <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                            ℹ️ Updating amount will adjust cash in hand by the difference
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