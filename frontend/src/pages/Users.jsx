import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Users as UsersIcon, Key } from 'lucide-react';
import { usersApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../utils/errorMessage';
import { usePaginatedList } from '../hooks/usePaginatedList';
import UserCard from '../components/users/UserCard';
import UserForm from '../components/users/UserForm';
import UserFilters from '../components/users/UserFilters';
import ChangePasswordModal from '../components/users/ChangePasswordModal';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Pagination from '../components/ui/Pagination';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

const Users = () => {
    const { user: currentUser } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formLoading, setFormLoading] = useState(false);

    const isSuperuser = currentUser?.role === 'superuser';

    // Backend returns all users in one call (bounded list) — filter client-side
    const { data: users, meta, page, setPage, loading, refetch } = usePaginatedList(
        usersApi.getAll, {}, 500
    );

    useEffect(() => {
        let filtered = [...users];
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (u) =>
                    u.email.toLowerCase().includes(q) ||
                    u.first_name.toLowerCase().includes(q) ||
                    u.last_name.toLowerCase().includes(q)
            );
        }
        if (roleFilter) filtered = filtered.filter((u) => u.role === roleFilter);
        setFilteredUsers(filtered);
    }, [users, searchTerm, roleFilter]);

    const handleCreateUser = async (data) => {
        setFormLoading(true);
        try {
            await usersApi.create(data);
            await refetch();
            setShowCreateModal(false);
            toast.success('User created successfully');
        } catch (error) {
            throw error; // Re-thrown so UserForm can map field errors
        } finally {
            setFormLoading(false);
        }
    };

    const handleUpdateUser = async (data) => {
        setFormLoading(true);
        try {
            await usersApi.updateProfile(data);
            await refetch();
            setShowEditModal(false);
            toast.success('User updated successfully');
        } catch (error) {
            throw error;
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeleteUser = async (email) => {
        try {
            await usersApi.delete(email);
            await refetch();
            toast.success('User deleted successfully');
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to delete user'));
        }
    };

    const handleChangePassword = async (data) => {
        setFormLoading(true);
        try {
            await usersApi.changeUserPassword(data);
            setShowPasswordModal(false);
            toast.success('Password changed successfully');
        } catch (error) {
            throw error;
        } finally {
            setFormLoading(false);
        }
    };

    if (!isSuperuser) {
        navigate('/dashboard');
        return null;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Users"
                subtitle="Manage system users and their permissions"
                icon={UsersIcon}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Key}
                            onClick={() => setShowPasswordModal(true)}
                        >
                            Change Password
                        </Button>
                        <Button icon={Plus} onClick={() => setShowCreateModal(true)}>
                            Add User
                        </Button>
                    </>
                }
            />

            <UserFilters
                onSearch={setSearchTerm}
                onRoleFilter={setRoleFilter}
                onFilter={() => {}}
            />

            <AnimatePresence mode="popLayout">
                {filteredUsers.length === 0 ? (
                    <EmptyState
                        title="No users found"
                        description="Try adjusting your search or add a new user."
                    />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filteredUsers.map((user) => (
                            <UserCard
                                key={user.email}
                                user={user}
                                onDelete={handleDeleteUser}
                                onEdit={(u) => {
                                    setSelectedUser(u);
                                    setShowEditModal(true);
                                }}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New User">
                <UserForm
                    onSubmit={handleCreateUser}
                    onCancel={() => setShowCreateModal(false)}
                    loading={formLoading}
                />
            </Modal>

            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit User">
                <UserForm
                    initialData={selectedUser}
                    onSubmit={handleUpdateUser}
                    onCancel={() => setShowEditModal(false)}
                    loading={formLoading}
                />
            </Modal>

            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                onSubmit={handleChangePassword}
                loading={formLoading}
                isSuperuser={isSuperuser}
            />
        </div>
    );
};

export default Users;
