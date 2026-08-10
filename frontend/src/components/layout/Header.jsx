import PropTypes from 'prop-types';
import { Menu } from 'lucide-react';
import Button from '../ui/Button';

const ROLE_LABELS = { superuser: 'Superuser', admin: 'Admin' };

const Header = ({ user, onToggleSidebar, onLogout }) => {
    return (
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-neutral-200">
            <div className="flex items-center justify-between h-16 px-4 sm:px-6">
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    aria-label="Toggle navigation"
                    className="p-3 -m-1 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
                >
                    <Menu className="w-5 h-5 text-neutral-600" />
                </button>

                <div className="flex items-center gap-3 sm:gap-4">
                    <span className="hidden sm:inline text-sm text-neutral-500">
                        {ROLE_LABELS[user?.role] || 'User'}
                    </span>
                    <Button size="sm" variant="secondary" onClick={onLogout}>
                        Logout
                    </Button>
                </div>
            </div>
        </header>
    );
};

Header.propTypes = {
    user: PropTypes.object,
    onToggleSidebar: PropTypes.func.isRequired,
    onLogout: PropTypes.func.isRequired,
};

export default Header;
