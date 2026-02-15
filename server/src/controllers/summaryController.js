import axios from 'axios';
import prisma from '../config/db.js';

export const createSummary = async (req, res) => {
    try {
        const { url } = req.body;
        const userId = req.userId;

        if (!url) {
            return res.status(400).json({ error: 'URL is required.' });
        }

        // Cache-first: check if this user already summarized this URL
        const existing = await prisma.summary.findFirst({
            where: { url, userId },
        });

        if (existing) {
            return res.json({ summary: existing.summary, cached: true, id: existing.id });
        }

        // Call RapidAPI
        const response = await axios.get(
            'https://article-extractor-and-summarizer.p.rapidapi.com/summarize',
            {
                params: { url: url, length: 3 },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPID_API_KEY,
                    'X-RapidAPI-Host': 'article-extractor-and-summarizer.p.rapidapi.com',
                },
            }
        );

        const summaryText = response.data?.summary;

        if (!summaryText) {
            return res.status(422).json({ error: 'Could not generate summary for this URL.' });
        }

        // Save to database
        const saved = await prisma.summary.create({
            data: { url, summary: summaryText, userId },
        });

        res.status(201).json({ summary: saved.summary, cached: false, id: saved.id });
    } catch (error) {
        console.error('CreateSummary error:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to summarize. Please try again.' });
    }
};

export const getHistory = async (req, res) => {
    try {
        const summaries = await prisma.summary.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ summaries });
    } catch (error) {
        console.error('GetHistory error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

export const deleteSummary = async (req, res) => {
    try {
        const { id } = req.params;

        // Ensure the summary belongs to this user
        const summary = await prisma.summary.findFirst({
            where: { id: parseInt(id), userId: req.userId },
        });

        if (!summary) {
            return res.status(404).json({ error: 'Summary not found.' });
        }

        await prisma.summary.delete({ where: { id: parseInt(id) } });

        res.json({ message: 'Summary deleted.' });
    } catch (error) {
        console.error('DeleteSummary error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};
