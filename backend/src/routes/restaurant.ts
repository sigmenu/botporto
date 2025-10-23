import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';

const DEFAULT_BUSINESS_HOURS = {
  monday: { open: '09:00', close: '22:00', closed: false },
  tuesday: { open: '09:00', close: '22:00', closed: false },
  wednesday: { open: '09:00', close: '22:00', closed: false },
  thursday: { open: '09:00', close: '22:00', closed: false },
  friday: { open: '09:00', close: '23:00', closed: false },
  saturday: { open: '09:00', close: '23:00', closed: false },
  sunday: { open: '10:00', close: '21:00', closed: false },
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value as T;
  if (typeof value === 'object') return value as T;

  const raw = String(value);

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (Array.isArray(fallback)) {
      const items = raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return items as unknown as T;
    }
    return fallback;
  }
};

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

    const restaurant = await prisma.restaurant.findFirst({
      where: { userId },
      include: {
        menuItems: true,
        promotions: true,
      },
    });

    const businessHours = parseJson(restaurant?.businessHours, DEFAULT_BUSINESS_HOURS);

    const menuItems = (restaurant?.menuItems || []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price: Number(item.price) || 0,
      category: item.category || '',
      isAvailable: item.isAvailable,
      preparationTime: item.preparationTime || 0,
      ingredients: parseJson<string[]>(item.ingredients, []),
      allergens: parseJson<string[]>(item.allergens, []),
      tags: [],
    }));

    const promotions = (restaurant?.promotions || []).map((promo) => ({
      id: promo.id,
      title: promo.title,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      minOrderValue: 0,
      validFrom: promo.startDate?.toISOString() || '',
      validUntil: promo.endDate?.toISOString() || '',
      isActive: promo.isActive,
      code: '',
      isRecurring: promo.isRecurring,
      recurringDays: parseJson<string[]>(promo.recurringDays, []),
    }));

    const data = {
      name: restaurant?.name || user.company || user.name || '',
      description: restaurant?.description || '',
      address: restaurant?.address || '',
      phone: restaurant?.phone || user.phone || '',
      whatsappNumber: restaurant?.whatsappNumber || user.phone || '',
      email: user.email,
      deliveryFee: restaurant?.deliveryFee ?? 0,
      minOrderValue: restaurant?.minOrderValue ?? 0,
      acceptsDelivery: restaurant?.acceptsDelivery ?? true,
      acceptsPickup: restaurant?.acceptsPickup ?? true,
      deliveryUrl: restaurant?.deliveryUrl || '',
      reservationUrl: restaurant?.reservationUrl || '',
      businessHours,
      menuItems,
      promotions,
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
    const {
      name,
      description,
      address,
      phone,
      whatsappNumber,
      businessHours,
      deliveryFee,
      minOrderValue,
      acceptsDelivery,
      acceptsPickup,
      deliveryUrl,
      reservationUrl,
    } = req.body || {};

    const existing = await prisma.restaurant.findFirst({ where: { userId } });

    const payload = {
      userId,
      name: name || existing?.name || 'Meu Restaurante',
      description: description ?? existing?.description ?? null,
      address: address ?? existing?.address ?? null,
      phone: phone ?? existing?.phone ?? null,
      whatsappNumber: whatsappNumber ?? existing?.whatsappNumber ?? null,
      businessHours: businessHours ? JSON.stringify(businessHours) : existing?.businessHours ?? JSON.stringify(DEFAULT_BUSINESS_HOURS),
      deliveryFee: deliveryFee !== undefined ? toFiniteNumber(deliveryFee, existing?.deliveryFee ?? 0) : existing?.deliveryFee ?? 0,
      minOrderValue: minOrderValue !== undefined ? toFiniteNumber(minOrderValue, existing?.minOrderValue ?? 0) : existing?.minOrderValue ?? 0,
      acceptsDelivery: acceptsDelivery !== undefined ? Boolean(acceptsDelivery) : existing?.acceptsDelivery ?? true,
      acceptsPickup: acceptsPickup !== undefined ? Boolean(acceptsPickup) : existing?.acceptsPickup ?? true,
      deliveryUrl: deliveryUrl ?? existing?.deliveryUrl ?? null,
      reservationUrl: reservationUrl ?? existing?.reservationUrl ?? null,
    };

    const restaurant = existing
      ? await prisma.restaurant.update({ where: { id: existing.id }, data: payload })
      : await prisma.restaurant.create({ data: payload });

    return res.json({ success: true, message: 'Informações salvas', data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar informações do restaurante' });
  }
});

export default router;