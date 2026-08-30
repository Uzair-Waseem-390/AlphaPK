import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import InlineAlert from '../components/ui/InlineAlert';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await login(email, password);
        if (result.success) {
            navigate('/dashboard');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-accent-900 flex items-center justify-center p-4">
            {/* Decorative blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent-600/10 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary-600/20 blur-3xl" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="bg-white rounded-3xl shadow-premium p-8">
                    {/* Logo + heading */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden bg-neutral-50 border border-neutral-200 shadow-sm">
                            <img
                                src="/logo.svg"
                                alt={import.meta.env.VITE_APP_NAME}
                                className="w-full h-full object-contain p-1.5"
                            />
                        </div>
                        <h1 className="text-2xl font-bold text-neutral-900">Welcome back</h1>
                        <p className="text-neutral-500 mt-1 text-sm">Sign in to {import.meta.env.VITE_APP_NAME}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input
                            label="Email address"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            icon={Mail}
                        />
                        <Input
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            icon={Lock}
                        />

                        {error && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <InlineAlert variant="error" message={error} />
                            </motion.div>
                        )}

                        <Button type="submit" loading={loading} className="w-full" size="md">
                            Sign in
                        </Button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
