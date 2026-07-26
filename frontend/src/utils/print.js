const openPdfBlob = async (url) => {
    const token = localStorage.getItem('access_token');
    if (!token) {
        throw new Error('Please login again to print');
    }

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate PDF');
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');

    setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
    }, 1000);
};

export const printInvoice = async (invoiceId, isDraft = false) => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    try {
        await openPdfBlob(`${baseUrl}/api/billing/invoices/${invoiceId}/print/?is_draft=${isDraft}`);
    } catch (error) {
        console.error('Print error:', error);
        throw error;
    }
};

// Generic report print — endpoint e.g. '/reports/expenses/print/', params
// are the report's CURRENT filters (date/date_from/date_to, or search for
// Inventory Valuation). No filters means every matching row prints.
export const printReport = async (endpoint, params = {}) => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const query = new URLSearchParams(params).toString();
    try {
        await openPdfBlob(`${baseUrl}/api${endpoint}${query ? `?${query}` : ''}`);
    } catch (error) {
        console.error('Print error:', error);
        throw error;
    }
};