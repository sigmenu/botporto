import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';

const router = Router();

// GET /api/restaurant/info
router.get('/info', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id || (req.query.userId as string);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, company: true, phone: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const restaurant = await prisma.restaurant.findFirst({ where: { userId } });

    const data = {
      name: restaurant?.name || user.company || user.name || 'Não configurado',
      contact: restaurant?.phone || user.phone || 'Não configurado',
      email: user.email,
      address: restaurant?.address || 'Não configurado',
      hours: restaurant?.businessHours || 'Não configurado',
      delivery: restaurant?.acceptsDelivery ?? false,
    };

    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao buscar informações do restaurante' });
  }
});

// POST /api/restaurant/info
router.post('/info', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const { name, description, address, phone, whatsappNumber, businessHours } = req.body || {};

    const restaurant = await prisma.restaurant.upsert({
      where: {
        // Não há unique em userId, então localizar primeiro
        id: (
          await prisma.restaurant.findFirst({ where: { userId }, select: { id: true } })
        )?.id || '___create___',
      },
      update: { name, description, address, phone, whatsappNumber, businessHours },
      create: { userId, name: name || 'Meu Restaurante', description, address, phone, whatsappNumber, businessHours },
    }).catch(async () => {
      // Fallback: se upsert com where fake falhar, faz create/update manual
      const existing = await prisma.restaurant.findFirst({ where: { userId } });
      if (existing) {
        return prisma.restaurant.update({ where: { id: existing.id }, data: { name, description, address, phone, whatsappNumber, businessHours } });
      }
      return prisma.restaurant.create({ data: { userId, name: name || 'Meu Restaurante', description, address, phone, whatsappNumber, businessHours } });
    });

    return res.json({ success: true, message: 'Informações salvas', data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar informações do restaurante' });
  }
});

export default router;