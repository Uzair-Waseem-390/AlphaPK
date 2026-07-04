import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';

const UserCard = ({ user, onDelete, onEdit }) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const roleColors = {
        superuser: 'bg-purple-100 text-purple-700',
        admin: 'bg-blue-100 text-blue-700',
        user: 'bg-green-100 text-green-700',
    };

    const roleLabels = {
        superuser: 'Superuser',
        admin: 'Admin',
        user: 'User',
    };

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
            >
                <Card className="relative overflow-hidden group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
                                    {user.first_name?.[0]}{user.last_name?.[0]}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-neutral-900">
                                        {user.first_name} {user.last_name}
                                    </h3>
                                    <p className="text-sm text-neutral-500">{user.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                                    {roleLabels[user.role]}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'
                                    }`}>
                                    {user.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <span className="text-xs text-neutral-400">
                                    Joined {new Date(user.date_joined).toLocaleDateString()}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEdit(user)}
                            >
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setShowDeleteModal(true)}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>

            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Delete User"
            >
                <div className="space-y-4">
                    <p className="text-neutral-600">
                        Are you sure you want to delete <strong>{user.email}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={() => {
                            onDelete(user.email);
                            setShowDeleteModal(false);
                        }}>
                            Delete User
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default UserCard;