// Single source of truth for app navigation.
// Mirrors frontend/src/config/navigation.js — role filtering applied at
// render time in the drawer layout, not here.

export type NavItem = {
  name: string;
  path: string;
  icon: string; // Lucide icon name (string) — we resolve to a component at render time
  adminOnly?: boolean;
  superuserOnly?: boolean;
};

export type NavGroup = {
  key: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// Main navigation — top-level items visible to all roles (unless flagged)
// ---------------------------------------------------------------------------
export const mainNavigation: NavItem[] = [
  { name: 'Dashboard', path: '/(app)/dashboard', icon: 'LayoutDashboard' },
  { name: 'Inventory', path: '/(app)/purchases/inventory', icon: 'Store' },
  { name: 'Rates', path: '/(app)/rates', icon: 'DollarSign' },
  { name: 'Cash Calculator', path: '/(app)/cash-calculator', icon: 'Calculator' },
  { name: 'Data Entry', path: '/(app)/data-entry', icon: 'DatabaseZap', superuserOnly: true },
];

// ---------------------------------------------------------------------------
// Nav groups — collapsible sections
// ---------------------------------------------------------------------------
export const navGroups: NavGroup[] = [
  {
    key: 'ledger',
    label: 'Ledger',
    icon: 'BookOpen',
    adminOnly: true,
    items: [
      { name: 'Suppliers', path: '/(app)/ledger', icon: 'Building2' },
      { name: 'Customers', path: '/(app)/ledger/customers', icon: 'User' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    icon: 'ShoppingCart',
    adminOnly: true,
    items: [
      { name: 'Categories', path: '/(app)/purchases/categories', icon: 'FolderOpen' },
      { name: 'Shelves', path: '/(app)/purchases/shelves', icon: 'Library' },
      { name: 'Suppliers', path: '/(app)/purchases/suppliers', icon: 'Building2' },
      { name: 'Products', path: '/(app)/purchases/products', icon: 'Package' },
      { name: 'Orders', path: '/(app)/purchases/orders', icon: 'ClipboardList' },
      { name: 'Payments', path: '/(app)/purchases/payments', icon: 'Wallet' },
      { name: 'Returns', path: '/(app)/purchases/returns', icon: 'Undo2' },
      { name: 'Outstanding', path: '/(app)/purchases/outstanding', icon: 'BarChart3' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: 'Receipt',
    items: [
      { name: 'Customers', path: '/(app)/billing/customers', icon: 'User' },
      { name: 'Invoices', path: '/(app)/billing/invoices', icon: 'FileText' },
      { name: 'Returns', path: '/(app)/billing/returns', icon: 'Undo2' },
      { name: 'Payments', path: '/(app)/billing/payments', icon: 'Wallet', adminOnly: true },
      { name: 'Invoices Outstanding', path: '/(app)/billing/outstanding', icon: 'BarChart3', adminOnly: true },
      { name: 'Due Invoices', path: '/(app)/billing/due', icon: 'Clock' },
      { name: 'Customer Outstanding', path: '/(app)/billing/customer-outstanding', icon: 'TrendingUp', adminOnly: true },
    ],
  },
  {
    key: 'recurringExpenses',
    label: 'Recurring Expenses',
    icon: 'Repeat',
    adminOnly: true,
    items: [
      { name: 'Overview', path: '/(app)/recurring-expenses', icon: 'Repeat' },
      { name: 'Categories', path: '/(app)/recurring-expenses/categories', icon: 'Tag' },
      { name: 'Templates', path: '/(app)/recurring-expenses/templates', icon: 'FileText' },
      { name: 'Post Dues', path: '/(app)/recurring-expenses/post-dues', icon: 'Send' },
      { name: 'Assignments', path: '/(app)/recurring-expenses/assignments', icon: 'ClipboardList' },
      { name: 'Monthly Breakdown', path: '/(app)/recurring-expenses/monthly-stats', icon: 'Calendar' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    icon: 'Wallet',
    adminOnly: true,
    items: [
      { name: 'Categories', path: '/(app)/expenses/categories', icon: 'FolderOpen' },
      { name: 'All Expenses', path: '/(app)/expenses', icon: 'ClipboardList' },
    ],
  },
  {
    key: 'taxes',
    label: 'Taxes',
    icon: 'Calculator',
    adminOnly: true,
    items: [
      { name: 'Overview', path: '/(app)/taxes', icon: 'Calculator' },
      { name: 'GST Payments', path: '/(app)/taxes/payments', icon: 'Receipt' },
      { name: 'WHT Payments', path: '/(app)/taxes/wht-payments', icon: 'IdCard' },
    ],
  },
  {
    key: 'cashManagement',
    label: 'Cash Management',
    icon: 'Banknote',
    adminOnly: true,
    items: [
      { name: 'Overview', path: '/(app)/cash-management', icon: 'Banknote' },
      { name: 'Cash Adjustments', path: '/(app)/cash-management/adjustments', icon: 'ArrowDownCircle' },
      { name: 'Investors', path: '/(app)/cash-management/investors', icon: 'Handshake' },
      { name: 'Growth History', path: '/(app)/cash-management/growth-history', icon: 'TrendingUp' },
      { name: 'Owner Transactions', path: '/(app)/cash-management/owner-transactions', icon: 'User' },
    ],
  },
  {
    key: 'paymentMethods',
    label: 'Payment Methods',
    icon: 'CreditCard',
    adminOnly: true,
    items: [
      { name: 'Payment Methods', path: '/(app)/payment-methods', icon: 'Wallet' },
      { name: 'Transfers', path: '/(app)/payment-methods/transfers', icon: 'ArrowLeftRight' },
    ],
  },
  {
    key: 'assets',
    label: 'Assets',
    icon: 'Building2',
    adminOnly: true,
    items: [
      { name: 'Overview', path: '/(app)/assets', icon: 'Building2' },
      { name: 'Categories', path: '/(app)/assets/categories', icon: 'Tag' },
      { name: 'Assets', path: '/(app)/assets/items', icon: 'Package' },
      { name: 'Disposals', path: '/(app)/assets/disposals', icon: 'Trash2' },
      { name: 'Payments', path: '/(app)/assets/payments', icon: 'Receipt' },
    ],
  },
  {
    key: 'profits',
    label: 'Profits',
    icon: 'Gem',
    adminOnly: true,
    items: [
      { name: 'Business Worth', path: '/(app)/business-worth', icon: 'Gem' },
      { name: 'Monthly Profits', path: '/(app)/monthly-profits', icon: 'BarChart3' },
      { name: 'Investor Payments', path: '/(app)/profits/payouts', icon: 'Banknote' },
      { name: 'Investors', path: '/(app)/profits/investors', icon: 'Handshake' },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    icon: 'Landmark',
    adminOnly: true,
    items: [
      { name: 'Income Statement', path: '/(app)/accounting/income-statement', icon: 'FileBarChart' },
      { name: 'Balance Sheet', path: '/(app)/accounting/balance-sheet', icon: 'Scale' },
      { name: 'Cash Flow Statement', path: '/(app)/accounting/cash-flow-statement', icon: 'ArrowLeftRight' },
      { name: 'A/R Aging', path: '/(app)/accounting/ar-aging', icon: 'TrendingUp' },
      { name: 'A/P Aging', path: '/(app)/accounting/ap-aging', icon: 'TrendingDown' },
      { name: 'Fixed Asset Register', path: '/(app)/accounting/fixed-asset-register', icon: 'Building2' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'TrendingUp',
    adminOnly: true,
    items: [
      { name: 'Invoices Report', path: '/(app)/reports/invoices', icon: 'Receipt' },
      { name: 'Cash Collected', path: '/(app)/reports/cash-collected', icon: 'Banknote' },
      { name: 'Credit Customers', path: '/(app)/reports/credit-customers', icon: 'CreditCard' },
      { name: 'Stock Movement', path: '/(app)/reports/stock-movement', icon: 'Package' },
      { name: 'Inventory Valuation', path: '/(app)/reports/inventory-valuation', icon: 'Store' },
      { name: 'Lost Inventory', path: '/(app)/reports/lost-inventory', icon: 'PackageX' },
      { name: 'Recurring Expenses', path: '/(app)/reports/recurring-expenses', icon: 'Repeat' },
      { name: 'Expenses Report', path: '/(app)/reports/expenses', icon: 'ClipboardList' },
      { name: 'Purchase Returns', path: '/(app)/reports/purchase-returns', icon: 'RotateCcw' },
      { name: 'Customer Returns', path: '/(app)/reports/customer-returns', icon: 'Undo2' },
      { name: 'Asset Depreciation', path: '/(app)/reports/asset-depreciation', icon: 'TrendingDown' },
      { name: 'Sales Tax Report', path: '/(app)/reports/sales-tax', icon: 'Receipt' },
      { name: 'Profit Margin', path: '/(app)/reports/profit-margin', icon: 'TrendingUp' },
      { name: 'Net Profit Report', path: '/(app)/reports/net-profit', icon: 'LineChart' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Standalone links — rendered after groups with a separator
// ---------------------------------------------------------------------------
export const standaloneLinks: NavItem[] = [
  { name: 'Users', path: '/(app)/users', icon: 'Users', superuserOnly: true },
  { name: 'Backups', path: '/(app)/backups', icon: 'Archive', adminOnly: true },
  { name: 'Activity Log', path: '/(app)/activity-log', icon: 'History', superuserOnly: true },
];
