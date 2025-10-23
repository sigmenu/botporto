import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';

const router = Router();

// GET /api/excluded-contacts
router.get('/', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id || (req.query.userId as string);

    const contacts = await prisma.excludedContact.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: contacts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar contatos excluídos' });
  }
});

// POST /api/excluded-contacts
router.post('/', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const { phoneNumber, reason } = req.body || {};

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber é obrigatório' });
    }

    const saved = await prisma.excludedContact.create({
      data: { userId, phoneNumber, reason },
    });

    return res.json({ success: true, message: 'Contato adicionado à lista de exclusão', data: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao adicionar contato excluído' });
  }
});

// DELETE /api/excluded-contacts/:id
router.delete('/:id', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await prisma.excludedContact.updateMany({
      where: { userId, id, isActive: true },
      data: { isActive: false },
    });

    return res.json({ success: true, message: 'Contato removido da lista de exclusão' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover contato excluído' });
  }
});

export default router;