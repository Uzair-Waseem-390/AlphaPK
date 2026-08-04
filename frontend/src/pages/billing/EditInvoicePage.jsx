import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import { ratesApi } from '../../services/ratesApi';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LineItemRow from '../../components/billing/LineItemRow';
import DraftPreviewPanel from '../../components/billing/DraftPreviewPanel';

const EditInvoicePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [invoice, setInvoice] = useState(null);
    const [preview, setPreview] = useState(null);

    const [formData, setFormData] = useState({
        customer_id: '',
        items: [],
    });

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const invoiceData = await billingApi.invoices.getById(id);
            setInvoice(invoiceData);

            // Populate form data
            setFormData({
                customer_id: invoiceData.customer?.id || '',
                items: invoiceData.items?.map(item => ({
                    product_id: item.product,
                    product_label: item.product_code ? `${item.product_code} - ${item.product_name}` : item.product_name,
                    quantity: item.quantity,
                    discount: item.discount || 0,
                    gst: item.gst || 0,
                    wht: item.wht || 0,
                    selling_price: item.selling_price || 0,
                })) || [],
            });

            // Set preview if available
            if (invoiceData.draft_preview) {
                setPreview(invoiceData.draft_preview);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Products come from the rate list, not the Purchases app — normal users
    // have no Purchases access, but rates are viewable by everyone, and every
    // rate already carries its product + selling price.
    const searchProducts = async (query) => {
        const res = await ratesApi.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results
            .filter(rate => rate.product?.id)
            .map(rate => ({
                value: rate.product.id,
                label: `${rate.product.code} - ${rate.product.name} (${rate.selling_price ?? 'No price'})`,
                sellingPrice: rate.selling_price || 0,
            }));
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
                    return { ...item, [field]: value };
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = {
                items: formData.items.map(item => ({
                    product_id: parseInt(item.product_id),
                    quantity: parseInt(item.quantity) || 0,
                    discount: parseFloat(item.discount) || 0,
                    gst: parseFloat(item.gst) || 0,
                    wht: parseFloat(item.wht) || 0,
                })),
            };
            await billingApi.invoices.update(id, data);
            navigate(`/billing/invoices/${id}`);
        } catch (error) {
            console.error('Failed to update invoice:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        navigate(`/billing/invoices/${id}`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!invoice || invoice.status !== 'draft') {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Invoice Not Editable</h2>
                <p className="text-neutral-500 mt-1">Only draft invoices can be edited.</p>
                <Button onClick={() => navigate('/billing/invoices')} className="mt-4">
                    Back to Invoices
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to={`/billing/invoices/${id}`} className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Invoice
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Edit Invoice</h1>
                    <p className="text-neutral-500">{invoice.bill_number}</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} loading={saving}>
                        Update Draft
                    </Button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6">
                    <div className="max-w-md">
                        <SearchableSelect
                            label="Customer"
                            value={formData.customer_id}
                            onChange={() => {}}
                            options={invoice.customer ? [{
                                value: invoice.customer.id,
                                label: invoice.customer.code ? `${invoice.customer.code} - ${invoice.customer.name}` : invoice.customer.name,
                            }] : []}
                            disabled={true}
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

                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {formData.items.length === 0 ? (
                            <p className="text-center text-neutral-500 py-8">No items added yet. Click "Add Item" to start.</p>
                        ) : (
                            formData.items.map((item, index) => (
                                <LineItemRow
                                    key={index}
                                    index={index}
                                    item={item}
                                    onSearchProducts={searchProducts}
                                    onUpdate={handleUpdateItem}
                                    onRemove={handleRemoveItem}
                                    canEdit={true}
                                />
                            ))
                        )}
                    </div>
                </Card>

                {formData.items.length > 0 && preview && (
                    <DraftPreviewPanel preview={preview} />
                )}
            </form>
        </div>
    );
};

export default EditInvoicePage;