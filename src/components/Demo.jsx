import { useState } from 'react';
import { copy, linkIcon, loader, tick } from '../assets';
import { useGetSummaryMutation, useGetHistoryQuery, useDeleteSummaryMutation } from '../services/article';
import { useAuth } from '../context/AuthContext';

const Demo = () => {
  const [article, setArticle] = useState({ url: '', summary: '' });
  const [copied, setCopied] = useState('');
  const { token } = useAuth();

  const [getSummary, { isLoading: isFetching, error: mutationError }] = useGetSummaryMutation();
  const { data: historyData } = useGetHistoryQuery(undefined, { skip: !token });
  const [deleteSummary] = useDeleteSummaryMutation();

  const allArticles = historyData?.summaries || [];

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if already in history
    const existing = allArticles.find((item) => item.url === article.url);
    if (existing) {
      setArticle({ url: existing.url, summary: existing.summary });
      return;
    }

    try {
      const result = await getSummary({ articleUrl: article.url }).unwrap();
      if (result?.summary) {
        setArticle({ url: article.url, summary: result.summary });
      }
    } catch (err) {
      console.error('Summary error:', err);
    }
  };

  const handleCopy = (copyUrl) => {
    setCopied(copyUrl);
    navigator.clipboard.writeText(copyUrl);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteSummary(id).unwrap();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.keyCode === 13) {
      handleSubmit(e);
    }
  };

  const error = mutationError;

  return (
    <section className="mt-16 w-full max-w-xl">
      {/* Search */}
      <div className="flex flex-col w-full gap-2">
        <form
          className="relative flex justify-center items-center"
          onSubmit={handleSubmit}
        >
          <img
            src={linkIcon}
            alt="link-icon"
            className="absolute left-0 my-2 ml-3 w-5"
          />

          <input
            type="url"
            placeholder="Paste the article link"
            value={article.url}
            onChange={(e) => setArticle({ ...article, url: e.target.value })}
            onKeyDown={handleKeyDown}
            required
            className="url_input peer"
          />
          <button
            type="submit"
            className="submit_btn peer-focus:border-gray-700 peer-focus:text-gray-700"
          >
            <p>↵</p>
          </button>
        </form>

        {/* Browse History */}
        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {allArticles.map((item) => (
            <div
              key={`link-${item.id}`}
              onClick={() => setArticle({ url: item.url, summary: item.summary })}
              className="link_card"
            >
              <div className="copy_btn" onClick={() => handleCopy(item.url)}>
                <img
                  src={copied === item.url ? tick : copy}
                  alt={copied === item.url ? 'tick_icon' : 'copy_icon'}
                  className="w-[40%] h-[40%] object-contain"
                />
              </div>
              <p className="flex-1 font-satoshi text-blue-700 font-medium text-sm truncate">
                {item.url}
              </p>
              <button
                onClick={(e) => handleDelete(e, item.id)}
                className="ml-2 text-red-400 hover:text-red-600 text-xs font-bold"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Display Result */}
      <div className="my-10 max-w-full flex justify-center items-center">
        {isFetching ? (
          <img src={loader} alt="loader" className="w-20 h-20 object-contain" />
        ) : error ? (
          <p className="font-inter font-bold text-black text-center">
            Well, that wasn't supposed to happen...
            <br />
            <span className="font-satoshi font-normal text-gray-700">
              {error?.data?.error || 'Something went wrong'}
            </span>
          </p>
        ) : (
          article.summary && (
            <div className="flex flex-col gap-3">
              <h2 className="font-satoshi font-bold text-gray-600 text-xl">
                Article <span className="blue_gradient">Summary</span>
              </h2>
              <div className="summary_box">
                <p className="font-inter font-medium text-sm text-gray-700">
                  {article.summary}
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
};

export default Demo;