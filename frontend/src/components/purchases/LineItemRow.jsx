import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

const LineItemRow = ({
    index,
    item,
    products,
    onUpdate,
    onRemove,
    canEdit = true,
}) => {
    const calculateTotals = () => {
        const gross = (item.quantity || 0) * (item.unit_price || 0);
        const gstAmount = gross * ((item.gst || 0) / 100);
        const whtAmount = gross * ((item.wht || 0) / 100);
        const total = gross + gstAmount - whtAmount;
        return { gross, gstAmount, whtAmount, total };
    };

    const totals = calculateTotals();

    const productOptions = products.map(p => ({
        value: p.id,
        label: `${p.code} - ${p.name}`,
    }));

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="col-span-12 md:col-span-3">
                    <Select
                        label="Product"
                        value={item.product}
                        onChange={(e) => onUpdate(index, 'product', e.target.value)}
                        options={productOptions}
                        placeholder="Select product"
                        disabled={!canEdit}
                        required
                    />
                </div>

                <div className="col-span-6 md:col-span-1">
                    <Input
                        label="Qty"
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 0)}
                        disabled={!canEdit}
                        required
                    />
                </div>

                <div className="col-span-6 md:col-span-2">
                    <Input
                        label="Unit Price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price || ''}
                        onChange={(e) => onUpdate(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        disabled={!canEdit}
                        required
                    />
                </div>

                <div className="col-span-4 md:col-span-1">
                    <Input
                        label="GST %"
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.gst || ''}
                        onChange={(e) => onUpdate(index, 'gst', parseFloat(e.target.value) || 0)}
                        disabled={!canEdit}
                        placeholder="0"
                    />
                </div>

                <div className="col-span-4 md:col-span-1">
                    <Input
                        label="WHT %"
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.wht || ''}
                        onChange={(e) => onUpdate(index, 'wht', parseFloat(e.target.value) || 0)}
                        disabled={!canEdit}
                        placeholder="0"
                    />
                </div>

                <div className="col-span-4 md:col-span-2">
                    <Input
                        label="Description"
                        value={item.description || ''}
                        onChange={(e) => onUpdate(index, 'description', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Optional"
                    />
                </div>

                <div className="col-span-6 md:col-span-1">
                    <div className="text-sm">
                        <p className="text-neutral-500 text-xs">Gross</p>
                        <p className="font-medium text-neutral-700">{totals.gross.toFixed(2)}</p>
                    </div>
                </div>

                <div className="col-span-6 md:col-span-1">
                    <div className="text-sm">
                        <p className="text-neutral-500 text-xs">Total</p>
                        <p className="font-medium text-primary-600">{totals.total.toFixed(2)}</p>
                    </div>
                </div>

                {canEdit && (
                    <div className="col-span-12 md:col-span-1">
                        <Button
                            size="sm"
                            variant="danger"
                            onClick={() => onRemove(index)}
                            className="w-full"
                        >
                            Remove
                        </Button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

LineItemRow.propTypes = {
    index: PropTypes.number.isRequired,
    item: PropTypes.object.isRequired,
    products: PropTypes.array.isRequired,
    onUpdate: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    canEdit: PropTypes.bool,
};

export default LineItemRow;