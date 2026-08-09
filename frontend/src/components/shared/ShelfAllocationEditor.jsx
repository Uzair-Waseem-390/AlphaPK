import SearchableSelect from '../ui/SearchableSelect';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * Reusable multi-shelf allocation row editor. Each row is a backend-driven
 * search (not a preloaded dropdown) — a large factory can have hundreds of
 * shelves, so every shelf picker here searches on demand, same pattern as
 * the customer search on Create Invoice.
 *
 * mode='putaway'     -> put-away context (receiving/returns-in), any shelf is valid.
 * mode='consumption' -> consumption context (sale/purchase-return/lost), only shelves
 *                        currently holding stock of the product are valid.
 *
 * value: [{ shelf_id, quantity, shelf_name? }] — shelf_name is carried along purely for
 *        display (SearchableSelect needs a label for a value that isn't in its current
 *        search results), not sent to the backend.
 * onChange(nextValue)
 * onSearchShelves(query): async (query) => [{ value, label, name?, available_quantity? }]
 *        — the parent supplies this, wired to whichever API endpoint fits the context
 *        (full shelf search for put-away, candidate-shelf search for consumption).
 * requiredQuantity: the number `value`'s quantities must sum to exactly.
 */
const ShelfAllocationEditor = ({
    value = [],
    onChange,
    onSearchShelves,
    requiredQuantity = 0,
    mode = 'putaway',
    disabled = false,
}) => {
    const allocations = value;
    const allocatedTotal = allocations.reduce((sum, a) => sum + (parseInt(a.quantity, 10) || 0), 0);
    const remaining = requiredQuantity - allocatedTotal;

    const handleAddRow = () => {
        onChange([...allocations, { shelf_id: '', quantity: remaining > 0 ? remaining : '', shelf_name: '' }]);
    };

    const handleUpdateRow = (index, patch) => {
        onChange(allocations.map((a, i) => (i === index ? { ...a, ...patch } : a)));
    };

    const handleRemoveRow = (index) => {
        onChange(allocations.filter((_, i) => i !== index));
    };

    // A shelf already picked on another row of this same allocation can't
    // be picked again (the unique_together constraint on the backend would
    // reject it anyway) — filtered out of search results per row.
    const usedElsewhere = (index) =>
        new Set(
            allocations
                .filter((_, i) => i !== index)
                .map((a) => String(a.shelf_id))
                .filter(Boolean)
        );

    const searchForRow = (index) => async (query) => {
        const results = await onSearchShelves(query);
        const exclude = usedElsewhere(index);
        return (results || []).filter((r) => !exclude.has(String(r.value)));
    };

    return (
        <div className="space-y-2">
            {allocations.map((a, index) => (
                <div key={index} className="flex items-start gap-2">
                    <div className="flex-1">
                        <SearchableSelect
                            value={a.shelf_id}
                            selectedLabel={a.shelf_name}
                            onChange={(val, option) =>
                                handleUpdateRow(index, { shelf_id: val, shelf_name: option?.name || option?.label || '' })
                            }
                            onSearch={searchForRow(index)}
                            placeholder="Search shelf by name..."
                            disabled={disabled}
                        />
                    </div>
                    <div className="w-28 shrink-0">
                        <Input
                            type="number"
                            min="1"
                            value={a.quantity}
                            onChange={(e) => handleUpdateRow(index, { quantity: e.target.value })}
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
                    disabled={disabled}
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

            {mode === 'consumption' && allocations.length === 0 && (
                <p className="text-xs text-neutral-400">
                    Search only finds shelves currently holding stock of this product.
                </p>
            )}
        </div>
    );
};

export default ShelfAllocationEditor;
