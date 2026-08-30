import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';

/**
 * Table — canonical data table with optional card shell.
 *
 * Props:
 *   columns   array    — [{ key, label, width?, render? }]
 *   data      array    — row objects (must have unique `id` or index is used)
 *   onRowClick fn      — called with the row object on row click
 *   loading   bool     — shows in-place loading overlay (keeps skeleton visible)
 *   emptyText string   — override the default "No data available" message
 *   card      bool     — wrap in a card shell (default: true)
 *   className string   — extra classes on the outer wrapper
 */
const Table = ({
    columns,
    data,
    onRowClick,
    loading = false,
    emptyText = 'No data available',
    card = true,
    className = '',
    ...props
}) => {
    const tableContent = (
        <div className={`overflow-x-auto relative ${loading ? 'opacity-60' : ''} transition-opacity duration-200`}>
            {loading && (
                <div className="absolute right-4 top-3 z-10">
                    <LoadingSpinner size="sm" />
                </div>
            )}
            <table className="w-full" {...props}>
                <thead>
                    <tr className="border-b border-neutral-100">
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/60"
                                style={{ width: col.width }}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                    {data.length === 0 ? (
                        <tr>
                            <td
                                colSpan={columns.length}
                                className="px-5 py-10 text-center text-sm text-neutral-400"
                            >
                                {emptyText}
                            </td>
                        </tr>
                    ) : (
                        data.map((row, index) => (
                            <motion.tr
                                key={row.id ?? index}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                                className={`hover:bg-neutral-50/80 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                onClick={() => onRowClick?.(row)}
                            >
                                {columns.map((col) => (
                                    <td key={col.key} className="px-5 py-3.5 text-sm text-neutral-700">
                                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                                    </td>
                                ))}
                            </motion.tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    if (!card) return <div className={className}>{tableContent}</div>;

    return (
        <div className={`bg-white rounded-2xl shadow-card overflow-hidden ${className}`}>
            {tableContent}
        </div>
    );
};

Table.propTypes = {
    columns: PropTypes.arrayOf(
        PropTypes.shape({
            key: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired,
            width: PropTypes.string,
            render: PropTypes.func,
        })
    ).isRequired,
    data: PropTypes.array.isRequired,
    onRowClick: PropTypes.func,
    loading: PropTypes.bool,
    emptyText: PropTypes.string,
    card: PropTypes.bool,
    className: PropTypes.string,
};

export default Table;
