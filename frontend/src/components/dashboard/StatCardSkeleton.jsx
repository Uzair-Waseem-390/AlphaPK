import PropTypes from 'prop-types';

// Matches the new StatCard layout: thin left dot, icon top-right, label + value
const StatCardSkeleton = () => {
    return (
        <div className="relative h-full min-h-[108px] bg-white rounded-2xl p-5 shadow-card ring-1 ring-neutral-100 overflow-hidden">
            {/* Left dot accent placeholder */}
            <span className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-neutral-200" />

            <div className="flex items-start justify-between gap-3 pl-2">
                <div className="flex-1 space-y-2 mt-0.5">
                    <div className="h-3 w-20 bg-neutral-200 rounded animate-pulse" />
                    <div className="h-6 w-28 bg-neutral-200 rounded-lg animate-pulse" />
                    <div className="h-2.5 w-16 bg-neutral-100 rounded animate-pulse" />
                </div>
                <div className="w-10 h-10 bg-neutral-100 rounded-xl animate-pulse flex-shrink-0" />
            </div>
        </div>
    );
};

StatCardSkeleton.propTypes = {
    color: PropTypes.oneOf(['primary', 'green', 'amber', 'red', 'blue', 'orange', 'purple']),
};

export default StatCardSkeleton;
