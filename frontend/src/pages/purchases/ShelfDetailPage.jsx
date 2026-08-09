import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { purchasesApi } from '../../services/purchasesApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import SearchBar from '../../components/ui/SearchBar';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import MoveStockModal from '../../components/purchases/MoveStockModal';

const ShelfDetailPage = () => {
    const { id } = useParams();

    const [shelf, setShelf] = useState(null);
    const [shelfLoading, setShelfLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showMoveModal, setShowMoveModal] = useState(false);

    const fetchShelf = async () => {
        setShelfLoading(true);
        try {
            const data = await purchasesApi.shelves.getById(id);
            setShelf(data);
        } catch (err) {
            console.error('Failed to fetch shelf:', err);
            setShelf(null);
        } finally {
            setShelfLoading(false);
        }
    };

    useEffect(() => {
        fetchShelf();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchStockPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.search = searchTerm;
        return purchasesApi.shelves.getStock(id, p);
    };

    const {
        data: stock, meta, page, setPage, loading, refetch,
    } = usePaginatedList(fetchStockPage, {}, 25, [id, searchTerm]);

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
    };

    const handleMoveSuccess = () => {
        setShowMoveModal(false);
        refetch();
    };

    const columns = [
        {
            key: 'product_name',
            label: 'Product Name',
            render: (_value, row) => row.product?.name || 'N/A',
        },
        {
            key: 'product_code',
            label: 'Product Code',
            render: (_value, row) => row.product?.code || 'N/A',
        },
        { key: 'quantity', label: 'Quantity' },
        {
            key: 'last_updated_at',
            label: 'Last Updated',
            render: (value) => value ? new Date(value).toLocaleString() : 'N/A',
        },
    ];

    if (shelfLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!shelf) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Shelf Not Found</h2>
                <p className="text-neutral-500 mt-1">The shelf you&apos;re looking for doesn&apos;t exist.</p>
                <Link to="/purchases/shelves" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Shelves
                </Link>
            </div>
        );
    }

    return (
        <>
            <MoveStockModal
                isOpen={showMoveModal}
                onClose={() => setShowMoveModal(false)}
                fromShelfId={id}
                onSuccess={handleMoveSuccess}
            />

            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <Link to="/purchases/shelves" className="text-sm text-primary-600 hover:text-primary-700">
                            ← Back to Shelves
                        </Link>
                        <h1 className="text-3xl font-bold text-neutral-900 mt-1">{shelf.name}</h1>
                        {shelf.description && (
                            <p className="text-neutral-500 mt-1">{shelf.description}</p>
                        )}
                    </div>
                    <Button
                        onClick={() => setShowMoveModal(true)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        )}
                    >
                        Move Stock
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-900">Products on this Shelf</h3>
                    </div>

                    <div className="mb-4">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by product name or code..."
                            className="w-full"
                        />
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size="lg" />
                        </div>
                    ) : (
                        <>
                            <Table columns={columns} data={stock} />

                            {meta.totalPages > 1 && (
                                <div className="mt-4">
                                    <Pagination
                                        currentPage={meta.currentPage}
                                        totalPages={meta.totalPages}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </Card>
            </div>
        </>
    );
};

export default ShelfDetailPage;
