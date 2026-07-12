import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import { ratesApi } from '../../services/ratesApi';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LineItemRow from '../../components/billing/LineItemRow';

const CreateInvoicePage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);

    const [formData, setFormData] = useState({
        customer_id: '',
        items: [],
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Products come from the rate list, not the Purchases app — normal
            // users have no Purchases access, but rates are viewable by everyone,
            // and every rate already carries its product + selling price.
            const [customersData, ratesData] = await Promise.all([
                billingApi.customers.getAll({ page_size: 500 }),
                ratesApi.getAll({ page_size: 500 }),
            ]);
            const customersList = customersData?.results ?? customersData ?? [];
            const ratesList = ratesData?.results ?? ratesData ?? [];
            const productsWithRates = ratesList
                .filter(rate => rate.product?.id)
                .map(rate => ({ ...rate.product, rate }));

            setCustomers(customersList);
            setProducts(productsWithRates);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                { product_id: '', quantity: 1, discount: 0, gst: 0, wht: 0, selling_price: 0 }
            ]
        }));
    };

    const handleUpdateItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => {
                if (i === index) {
                    const updatedItem = { ...item, [field]: value };
                    // If product changes, update selling price
                    if (field === 'product_id') {
                        const product = products.find(p => p.id === parseInt(value));
                        updatedItem.selling_price = product?.rate?.selling_price || 0;
                    }
                    return updatedItem;
                }
                return item;
            })
        }));
    };

    const handleRemoveItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    // Calculate totals
    const calculateTotals = () => {
        let subtotal = 0;
        let gstTotal = 0;
        let whtTotal = 0;
        let grandTotal = 0;

        formData.items.forEach(item => {
            const quantity = parseInt(item.quantity) || 0;
            const sellingPrice = parseFloat(item.selling_price) || 0;
            const discount = parseFloat(item.discount) || 0;
            const gst = parseFloat(item.gst) || 0;
            const wht = parseFloat(item.wht) || 0;

            const lineTotal = quantity * sellingPrice;
            const discountAmount = lineTotal * (discount / 100);
            const afterDiscount = lineTotal - discountAmount;
            const gstAmount = afterDiscount * (gst / 100);
            const whtAmount = afterDiscount * (wht / 100);
            const total = afterDiscount + gstAmount - whtAmount;

            subtotal += lineTotal;
            gstTotal += gstAmount;
            whtTotal += whtAmount;
            grandTotal += total;
        });

        return { subtotal, gstTotal, whtTotal, grandTotal };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const data = {
                customer_id: parseInt(formData.customer_id),
                items: formData.items.map(item => ({
                    product_id: parseInt(item.product_id),
                    quantity: parseInt(item.quantity) || 0,
                    discount: parseFloat(item.discount) || 0,
                    gst: parseFloat(item.gst) || 0,
                    wht: parseFloat(item.wht) || 0,
                })),
            };
            const result = await billingApi.invoices.create(data);
            navigate(`/billing/invoices/${result.id}`);
        } catch (error) {
            console.error('Failed to create invoice:', error);
            alert(error.response?.data?.detail || 'Failed to create invoice');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        navigate('/billing/invoices');
    };

    if (loading && customers.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    const totals = calculateTotals();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Create Invoice</h1>
                    <p className="text-neutral-500 mt-1">Create a new draft invoice</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} loading={loading}>
                        Create Draft
                    </Button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6">
                    <div className="max-w-md">
                        <SearchableSelect
                            label="Customer"
                            value={formData.customer_id}
                            onChange={(value) => setFormData(prev => ({ ...prev, customer_id: value }))}
                            options={customers.map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                            placeholder="Search customer by name or code"
                            required
                        />
                    </div>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-900">Line Items</h3>
                        <Button size="sm" onClick={handleAddItem}>
                            Add Item
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {formData.items.length === 0 ? (
                            <p className="text-center text-neutral-500 py-8">No items added yet. Click "Add Item" to start.</p>
                        ) : (
                            formData.items.map((item, index) => (
                                <LineItemRow
                                    key={index}
                                    index={index}
                                    item={item}
                                    products={products}
                                    onUpdate={handleUpdateItem}
                                    onRemove={handleRemoveItem}
                                    canEdit={true}
                                />
                            ))
                        )}
                    </div>

                    {/* Simple Totals Summary */}
                    {formData.items.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-neutral-200">
                            <div className="flex flex-col items-end space-y-2 max-w-xs ml-auto">
                                <div className="flex justify-between w-full">
                                    <span className="text-sm text-neutral-500">Subtotal:</span>
                                    <span className="text-sm font-medium text-neutral-900">
                                        PKR {totals.subtotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between w-full">
                                    <span className="text-sm text-neutral-500">GST Total:</span>
                                    <span className="text-sm font-medium text-neutral-900">
                                        PKR {totals.gstTotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between w-full">
                                    <span className="text-sm text-neutral-500">WHT Total:</span>
                                    <span className="text-sm font-medium text-neutral-900">
                                        PKR {totals.whtTotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between w-full pt-2 border-t border-neutral-200">
                                    <span className="text-base font-semibold text-neutral-900">Grand Total:</span>
                                    <span className="text-base font-bold text-primary-600">
                                        PKR {totals.grandTotal.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </form>
        </div>
    );
};

export default CreateInvoicePage;