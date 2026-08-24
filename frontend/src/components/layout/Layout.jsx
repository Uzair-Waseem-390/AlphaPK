import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { mainNavigation, navGroups, standaloneLinks } from '../../config/navigation';

const LG_BREAKPOINT = 1024;

// Build a flat path → label map from navigation config at module-level
// so it's computed once, not on every render.
const buildTitleMap = () => {
    const map = {};
    mainNavigation.forEach((item) => { map[item.path] = item.name; });
    navGroups.forEach((group) => {
        group.items.forEach((item) => { map[item.path] = item.name; });
    });
    standaloneLinks.forEach((item) => { map[item.path] = item.name; });

    // Extra routes not in the nav config
    map['/dashboard'] = 'Dashboard';
    map['/profile'] = 'Profile';
    map['/activity-log'] = 'Activity Log';
    map['/business-worth'] = 'Business Worth';
    map['/monthly-profits'] = 'Monthly Profits';

    return map;
};

const TITLE_MAP = buildTitleMap();

const resolvePageTitle = (pathname) => {
    // Exact match first
    if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];

    // Longest prefix match for detail/nested routes (e.g. /purchases/orders/123)
    let best = '';
    let bestTitle = '';
    Object.entries(TITLE_MAP).forEach(([path, title]) => {
        if (pathname.startsWith(path) && path.length > best.length) {
            best = path;
            bestTitle = title;
        }
    });
    return bestTitle || '';
};

const Layout = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleToggleSidebar = () => {
        if (window.innerWidth < LG_BREAKPOINT) {
            setMobileOpen((prev) => !prev);
        } else {
            setSidebarOpen((prev) => !prev);
        }
    };

    const pageTitle = useMemo(() => resolvePageTitle(location.pathname), [location.pathname]);

    return (
        <div className="min-h-screen bg-neutral-50/80">
            <Sidebar
                desktopOpen={sidebarOpen}
                mobileOpen={mobileOpen}
                onCloseMobile={() => setMobileOpen(false)}
            />

            <div className={`transition-all duration-300 ml-0 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-[70px]'}`}>
                <Header
                    user={user}
                    onToggleSidebar={handleToggleSidebar}
                    onLogout={logout}
                    pageTitle={pageTitle}
                />
                <main className="p-4 sm:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
