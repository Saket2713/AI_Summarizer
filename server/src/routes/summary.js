import { Router } from 'express';
import { createSummary, getHistory, deleteSummary } from '../controllers/summaryController.js';
import auth from '../middleware/auth.js';

const router = Router();

// All summary routes require authentication
router.post('/', auth, createSummary);
router.get('/', auth, getHistory);
router.delete('/:id', auth, deleteSummary);

export default router;
