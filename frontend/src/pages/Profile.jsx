import { useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../utils/errorMessage';
import { usersApi } from '../utils/api';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import ChangePasswordModal from '../components/users/ChangePasswordModal';

const Profile = () => {
    const { user, updateUser } = useAuth();
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
    });
    const [loading, setLoading] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updatedUser = await usersApi.updateProfile(formData);
            updateUser(updatedUser);
            toast.success('Profile updated successfully');
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to update profile'));
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (data) => {
        await usersApi.changeOwnPassword(data);
        toast.success('Password changed successfully');
    };

    if (!user) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <PageHeader
                title="Profile"
                subtitle="Manage your account settings"
                icon={User}
            />

            <Card hover={false} className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Avatar + identity */}
                    <div className="flex items-center gap-4 pb-5 border-b border-neutral-100">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-primary-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <div>
                            <p className="font-semibold text-neutral-900">
                                {user.first_name} {user.last_name}
                            </p>
                            <p className="text-sm text-neutral-500 capitalize">{user.role}</p>
                            <p className="text-sm text-neutral-400">{user.email}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="First Name"
                            name="first_name"
                            value={formData.first_name}
                            onChange={handleChange}
                            placeholder="John"
                            required
                        />
                        <Input
                            label="Last Name"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleChange}
                            placeholder="Doe"
                            required
                        />
                    </div>

                    <Input
                        label="Email"
                        type="email"
                        value={user.email}
                        disabled
                    />

                    <div className="flex gap-3 pt-2">
                        <Button type="submit" loading={loading}>
                            Save changes
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setShowPasswordModal(true)}
                        >
                            Change password
                        </Button>
                    </div>
                </form>
            </Card>

            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                onSubmit={handleChangePassword}
                loading={loading}
                isSuperuser={false}
            />
        </div>
    );
};

export default Profile;
