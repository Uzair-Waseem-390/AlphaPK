import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { cashFlowApi } from '../../services/cashFlowApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';

const ExpenseDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [expense, setExpense] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchExpenseDetails();
    }, [id]);

    const fetchExpenseDetails = async () => {
        setLoading(true);
        try {
            // Get all expenses and find the specific one
            const expenses = await cashFlowApi.expenses.getAll();
            const found = expenses.find(e => e.id === parseInt(id));
            setExpense(found || null);
        } catch (error) {
            console.error('Failed to fetch expense details:', error);
            setExpense(null);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = () => {
        navigate(`/expenses/${id}/edit`);
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this expense? This will restore the amount to cash in hand.')) return;
        try {
            await cashFlowApi.expenses.delete(id);
            navigate('/expenses');
        } catch (error) {
            console.error('Failed to delete expense:', error);
        }
    };

    if (loading) {
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
                <p className="text-neutral-500 mt-1">The expense you're looking for doesn't exist.</p>
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
                    <Link to="/expenses" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Expenses
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Expense Details</h1>
                    <p className="text-neutral-500">{expense.name}</p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={handleEdit}>
                            Edit
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {/* Expense Information */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Expense Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Name</p>
                        <p className="font-medium">{expense.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Category</p>
                        <Badge>{expense.category?.name || 'N/A'}</Badge>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Amount</p>
                        <p className="text-xl font-bold text-error-600">
                            {typeof expense.amount === 'string'
                                ? parseFloat(expense.amount).toFixed(2)
                                : '0.00'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Expense Date</p>
                        <p className="font-medium">{new Date(expense.expense_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created By</p>
                        <p className="font-medium">{expense.created_by || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created At</p>
                        <p className="font-medium">{new Date(expense.created_at).toLocaleString()}</p>
                    </div>
                    {expense.updated_by && (
                        <div>
                            <p className="text-sm text-neutral-500">Updated By</p>
                            <p className="font-medium">{expense.updated_by}</p>
                        </div>
                    )}
                    {expense.updated_at && expense.updated_at !== expense.created_at && (
                        <div>
                            <p className="text-sm text-neutral-500">Updated At</p>
                            <p className="font-medium">{new Date(expense.updated_at).toLocaleString()}</p>
                        </div>
                    )}
                    {expense.description && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Description</p>
                            <p className="font-medium">{expense.description}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Cash Impact */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Cash Impact</h3>
                <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="text-amber-700">
                        This expense reduced cash in hand by <strong>Rs. {typeof expense.amount === 'string' ? parseFloat(expense.amount).toFixed(2) : '0.00'}</strong>
                    </p>
                    <p className="text-sm text-amber-600 mt-1">
                        Created on {new Date(expense.expense_date).toLocaleDateString()}
                    </p>
                </div>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/expenses">
                    <Button variant="secondary">
                        ← Back to Expenses
                    </Button>
                </Link>
                {isAdmin && (
                    <>
                        <Button variant="secondary" onClick={handleEdit}>
                            Edit Expense
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Delete Expense
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ExpenseDetailPage;