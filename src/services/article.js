import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_URL = import.meta.env.VITE_API_URL || '';

export const articleApi = createApi({
    reducerPath: 'articleApi',
    baseQuery: fetchBaseQuery({
        baseUrl: `${API_URL}/api`,
        prepareHeaders: (headers) => {
            const token = localStorage.getItem('token');
            if (token) {
                headers.set('Authorization', `Bearer ${token}`);
            }
            headers.set('Content-Type', 'application/json');
            return headers;
        },
    }),
    tagTypes: ['Summaries'],
    endpoints: (builder) => ({
        getSummary: builder.mutation({
            query: (params) => ({
                url: '/summaries',
                method: 'POST',
                body: { url: params.articleUrl },
            }),
            invalidatesTags: ['Summaries'],
        }),
        getHistory: builder.query({
            query: () => '/summaries',
            providesTags: ['Summaries'],
        }),
        deleteSummary: builder.mutation({
            query: (id) => ({
                url: `/summaries/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Summaries'],
        }),
    }),
});

export const {
    useGetSummaryMutation,
    useGetHistoryQuery,
    useDeleteSummaryMutation,
} = articleApi;