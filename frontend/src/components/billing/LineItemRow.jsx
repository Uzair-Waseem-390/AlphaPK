import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Input from '../ui/Input';
import SearchableSelect from '../ui/SearchableSelect';
import Button from '../ui/Button';

const LineItemRow = ({
    index,
    item,
    onSearchProducts,
    onUpdate,
    onRemove,
    canEdit = true,
}) => {
    const calculateTotals = () => {
        const gross = (item.quantity || 0) * (item.selling_price || 0);
        const gstAmount = gross * ((item.gst || 0) / 100);
        const whtAmount = gross * ((item.wht || 0) / 100);
        const total = gross + gstAmount - whtAmount;
        return { gross, gstAmount, whtAmount, total };
    };

    const totals = calculateTotals();
    const effectivePrice = (item.selling_price || 0) - (item.discount || 0);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
        >
            {/* Row 1: Product and Quantity */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div className="col-span-1 md:col-span-3">
                    <SearchableSelect
                        label="Product"
                        value={item.product_id || ''}
                        selectedLabel={item.product_label}
                        onChange={(value, option) => {
                            onUpdate(index, 'product_id', parseInt(value));
                            onUpdate(index, 'product_label', option?.label ?? '');
                            onUpdate(index, 'selling_price', option?.sellingPrice ?? 0);
                        }}
                        onSearch={onSearchProducts}
                        placeholder="Search product by name or code"
                        disabled={!canEdit}
                        required
                    />
                </div>
                <div className="col-span-1">
                    <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 0)}
                        disabled={!canEdit}
                        required
                    />
                </div>
            </div>

            {/* Row 2: Discount, GST, WHT */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                    <Input
                        label="Discount"
                        type="number"
                        step="0.01"
                        value={item.discount || ''}
                        onChange={(e) => onUpdate(index, 'discount', parseFloat(e.target.value) || 0)}
                        disabled={!canEdit}
                        placeholder="0"
                    />
                    <p className="text-xs text-neutral-400 mt-1">Effective Price: {effectivePrice.toFixed(2)}</p>
                </div>
                <div>
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
                <div>
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
            </div>

            {/* Row 3: Selling Price, Gross, Total, Remove */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="col-span-1">
                    <div className="text-sm bg-neutral-50 p-2 rounded-lg">
                        <p className="text-neutral-500 text-xs">Selling Price</p>
                        <p className="font-medium text-neutral-700">
                            {item.selling_price ? parseFloat(item.selling_price).toFixed(2) : '0.00'}
                        </p>
                    </div>
                </div>
                <div className="col-span-1">
                    <div className="text-sm bg-neutral-50 p-2 rounded-lg">
                        <p className="text-neutral-500 text-xs">Gross Amount</p>
                        <p className="font-medium text-neutral-700">{totals.gross.toFixed(2)}</p>
                    </div>
                </div>
                <div className="col-span-1">
                    <div className="text-sm bg-primary-50 p-2 rounded-lg">
                        <p className="text-neutral-500 text-xs">Total</p>
                        <p className="font-medium text-primary-600">{totals.total.toFixed(2)}</p>
                    </div>
                </div>
                <div className="col-span-1">
                    {canEdit && (
                        <Button
                            size="sm"
                            variant="danger"
                            onClick={() => onRemove(index)}
                            className="w-full"
                        >
                            Remove
                        </Button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

LineItemRow.propTypes = {
    index: PropTypes.number.isRequired,
    item: PropTypes.object.isRequired,
    onSearchProducts: PropTypes.func.isRequired,
    onUpdate: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    canEdit: PropTypes.bool,
};

export default LineItemRow;