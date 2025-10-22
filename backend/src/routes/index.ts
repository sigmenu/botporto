import { Router } from 'express';
import authRoutes from './auth';
import sessionRoutes from './sessions';
import messageRoutes from './messages';
import contactRoutes from './contacts';
import templateRoutes from './templates';
import webhookRoutes from './webhooks';
import userRoutes from './users';
import analyticsRoutes from './analytics';
import subscriptionRoutes from './subscriptions';
import botRoutes from './bot';
import restaurantRoutes from './restaurant';
import excludedContactsRoutes from './excludedContacts';
import whatsappRoutes from './whatsapp';

const router = Router();

// Montar rotas
router.use('/auth', authRoutes);
router.use('/sessions', sessionRoutes);
router.use('/messages', messageRoutes);
router.use('/contacts', contactRoutes);
router.use('/templates', templateRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/users', userRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/subscriptions', subscriptionRoutes);

// Novas rotas
router.use('/bot', botRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/excluded-contacts', excludedContactsRoutes);
router.use('/whatsapp', whatsappRoutes);

export default router;