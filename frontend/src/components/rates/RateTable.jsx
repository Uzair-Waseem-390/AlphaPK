import PropTypes from 'prop-types';
import RateRow from './RateRow';

const RateTable = ({
    rates,
    isAdmin,
    onEdit,
    onViewHistory,
    loading
}) => {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (rates.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="text-6xl mb-4">💰</div>
                <h3 className="text-lg font-semibold text-neutral-900">No Rates Found</h3>
                <p className="text-sm text-neutral-500 mt-1">
                    Try adjusting your search or filters
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-neutral-200">
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Product Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Product Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Category
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Shelf
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Selling Price
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Last Updated By
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Last Updated
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                    {rates.map((item, index) => (
                        <RateRow
                            key={item.product.id}
                            product={item.product}
                            rate={item.rate}
                            isAdmin={isAdmin}
                            onEdit={onEdit}
                            onViewHistory={onViewHistory}
                            index={index}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

RateTable.propTypes = {
    rates: PropTypes.array.isRequired,
    isAdmin: PropTypes.bool.isRequired,
    onEdit: PropTypes.func.isRequired,
    onViewHistory: PropTypes.func.isRequired,
    loading: PropTypes.bool,
};

export default RateTable;