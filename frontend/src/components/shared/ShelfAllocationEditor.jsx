import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * Reusable multi-shelf allocation row editor.
 *
 * mode='putaway'     -> `shelves` is the full active shelf list (any shelf valid, e.g. receiving/returns-in).
 * mode='consumption' -> `shelves` is the candidate list for a specific product (only shelves holding stock),
 *                        each entry carrying `available_quantity` shown in the option label.
 *
 * value: [{ shelf_id, quantity }]
 * onChange(nextValue)
 * requiredQuantity: the number `value`'s quantities must sum to exactly before the parent flow can proceed.
 * shelves: [{ id, name, available_quantity? }]
 */
const ShelfAllocationEditor = ({
    value = [],
    onChange,
    shelves = [],
    requiredQuantity = 0,
    mode = 'putaway',
    disabled = false,
}) => {
    const allocations = value;
    const allocatedTotal = allocations.reduce((sum, a) => sum + (parseInt(a.quantity, 10) || 0), 0);
    const remaining = requiredQuantity - allocatedTotal;
    const usedShelfIds = new Set(allocations.map((a) => String(a.shelf_id)).filter(Boolean));

    const handleAddRow = () => {
        onChange([...allocations, { shelf_id: '', quantity: remaining > 0 ? remaining : '' }]);
    };

    const handleUpdateRow = (index, field, val) => {
        onChange(allocations.map((a, i) => (i === index ? { ...a, [field]: val } : a)));
    };

    const handleRemoveRow = (index) => {
        onChange(allocations.filter((_, i) => i !== index));
    };

    const shelfOptions = (currentShelfId) =>
        shelves
            .filter((s) => String(s.id) === String(currentShelfId) || !usedShelfIds.has(String(s.id)))
            .map((s) => ({
                value: s.id,
                label:
                    mode === 'consumption' && s.available_quantity != null
                        ? `${s.name} (${s.available_quantity} available)`
                        : s.name,
            }));

    const allRowsUsed = shelves.length > 0 && usedShelfIds.size >= shelves.length;

    return (
        <div className="space-y-2">
            {allocations.map((a, index) => (
                <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                        <Select
                            value={a.shelf_id}
                            onChange={(e) => handleUpdateRow(index, 'shelf_id', e.target.value)}
                            options={shelfOptions(a.shelf_id)}
                            placeholder="Select shelf"
                            disabled={disabled}
                        />
                    </div>
                    <div className="w-28 shrink-0">
                        <Input
                            type="number"
                            min="1"
                            value={a.quantity}
                            onChange={(e) => handleUpdateRow(index, 'quantity', e.target.value)}
                            placeholder="Qty"
                            disabled={disabled}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRemoveRow(index)}
                        disabled={disabled}
                    >
                        Remove
                    </Button>
                </div>
            ))}

            <div className="flex items-center justify-between gap-3">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddRow}
                    disabled={disabled || allRowsUsed}
                >
                    + Add Shelf
                </Button>
                <span
                    className={`text-sm font-medium ${
                        remaining === 0
                            ? 'text-green-600'
                            : remaining < 0
                                ? 'text-red-600'
                                : 'text-amber-600'
                    }`}
                >
                    {remaining === 0
                        ? `Fully allocated (${allocatedTotal}/${requiredQuantity})`
                        : remaining > 0
                            ? `${remaining} of ${requiredQuantity} remaining to allocate`
                            : `Over-allocated by ${-remaining}`}
                </span>
            </div>

            {mode === 'consumption' && shelves.length === 0 && (
                <p className="text-sm text-red-600">
                    No shelf currently holds stock of this product — nothing can be allocated.
                </p>
            )}
        </div>
    );
};

export default ShelfAllocationEditor;
