import React from 'react';
import { logo } from '../assets';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Hero = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAuthAction = () => {
    if (user) {
      logout();
      navigate('/login');
    } else {
      navigate('/login');
    }
  };

  return (
    <header className="w-full flex justify-center items-center flex-col">
      <nav className="flex justify-between items-center w-full mb-10 pt-3">
        <Link to="/">
          <img src={logo} alt="sumz_logo" className="w-28 object-contain" />
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <span className="font-satoshi text-sm text-gray-600">
              Hi, <span className="font-semibold">{user.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleAuthAction}
            className="black_btn"
          >
            {user ? 'Logout' : 'Sign In'}
          </button>
        </div>
      </nav>
      <h1 className="head_text">
        Summarize Articles with <br className="max-md:hidden " />
        <span className="orange_gradient">OpenAI GPT-4</span>
      </h1>
      <h2 className="desc">
        Simplify your reading with Summarize, an open-source article summarizer
        that transforms lengthy articles into clear and concise summaries
      </h2>
    </header>
  );
};

export default Hero;