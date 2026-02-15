import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className="w-full max-w-md mx-auto mt-20">
            <div className="glassmorphism p-8 rounded-xl">
                <h2 className="font-satoshi font-bold text-2xl text-gray-800 text-center mb-6">
                    Welcome <span className="blue_gradient">Back</span>
                </h2>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="font-satoshi font-medium text-sm text-gray-700 mb-1 block">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="url_input !pl-4"
                        />
                    </div>

                    <div>
                        <label className="font-satoshi font-medium text-sm text-gray-700 mb-1 block">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className="url_input !pl-4"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="black_btn w-full mt-2 py-2.5 disabled:opacity-50"
                    >
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p className="font-satoshi text-sm text-gray-500 text-center mt-5">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-blue-600 font-medium hover:underline">
                        Sign Up
                    </Link>
                </p>
            </div>
        </section>
    );
};

export default Login;
