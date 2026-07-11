import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import UserCard from '../components/users/UserCard';
import UserForm from '../components/users/UserForm';
import UserFilters from '../components/users/UserFilters';
import ChangePasswordModal from '../components/users/ChangePasswordModal';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';

const Users = () => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formLoading, setFormLoading] = useState(false);

    const isSuperuser = currentUser?.role === 'superuser';

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        let filtered = [...users];

        if (searchTerm) {
            filtered = filtered.filter(u =>
                u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.last_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (roleFilter) {
            filtered = filtered.filter(u => u.role === roleFilter);
        }

        setFilteredUsers(filtered);
    }, [users, searchTerm, roleFilter]);

    const fetchUsers = async () => {
        try {
            const data = await usersApi.getAll();
            setUsers(data);
            setFilteredUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (data) => {
        setFormLoading(true);
        try {
            await usersApi.create(data);
            await fetchUsers();
            setShowCreateModal(false);
        } catch (error) {
            console.error('Failed to create user:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleUpdateUser = async (data) => {
        setFormLoading(true);
        try {
            await usersApi.updateProfile(data);
            await fetchUsers();
            setShowEditModal(false);
        } catch (error) {
            console.error('Failed to update user:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeleteUser = async (email) => {
        if (!window.confirm(`Are you sure you want to delete ${email}?`)) return;

        try {
            await usersApi.delete(email);
            await fetchUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
        }
    };

    // Update the handleChangePassword function in Users.jsx
    const handleChangePassword = async (data) => {
        // data will contain { email, new_password, confirm_password }
        setFormLoading(true);
        try {
            await usersApi.changeUserPassword(data);
            setShowPasswordModal(false);
            // Show success message (you can add a toast notification here)
            alert('Password changed successfully!');
        } catch (error) {
            console.error('Failed to change password:', error);
            throw error; // Re-throw so the modal can handle the error
        } finally {
            setFormLoading(false);
        }
    };

    // Listing all users is superuser-only
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
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Users</h1>
                    <p className="text-neutral-500 mt-1">Manage your users and their permissions</p>
                </div>

                {isSuperuser && (
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setShowPasswordModal(true)}
                        >
                            Change Password
                        </Button>
                        <Button
                            onClick={() => setShowCreateModal(true)}
                            icon={({ className }) => (
                                <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                        >
                            Add User
                        </Button>
                    </div>
                )}
            </div>

            {/* Filters */}
            <UserFilters
                onSearch={setSearchTerm}
                onRoleFilter={setRoleFilter}
                onFilter={() => { }}
            />

            {/* User List */}
            <AnimatePresence mode="popLayout">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredUsers.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="col-span-full text-center py-12"
                        >
                            <p className="text-neutral-500">No users found</p>
                        </motion.div>
                    ) : (
                        filteredUsers.map((user) => (
                            <UserCard
                                key={user.email}
                                user={user}
                                onDelete={handleDeleteUser}
                                onEdit={(user) => {
                                    setSelectedUser(user);
                                    setShowEditModal(true);
                                }}
                            />
                        ))
                    )}
                </div>
            </AnimatePresence>

            {/* Create User Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Create New User"
            >
                <UserForm
                    onSubmit={handleCreateUser}
                    onCancel={() => setShowCreateModal(false)}
                    loading={formLoading}
                />
            </Modal>

            {/* Edit User Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit User"
            >
                <UserForm
                    initialData={selectedUser}
                    onSubmit={handleUpdateUser}
                    onCancel={() => setShowEditModal(false)}
                    loading={formLoading}
                />
            </Modal>

            {/* Change Password Modal */}
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