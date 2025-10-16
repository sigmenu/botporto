'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft, 
  Save,
  UtensilsCrossed,
  DollarSign,
  Eye,
  Upload,
  Image as ImageIcon,
  Clock,
  Star
} from 'lucide-react'

interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: string
  image?: string
  available: boolean
  preparationTime?: number
  ingredients?: string[]
  allergens?: string[]
  rating?: number
}

interface MenuCategory {
  id: string
  name: string
  description?: string
  order: number
  active: boolean
}

const DEFAULT_CATEGORIES: MenuCategory[] = [
  { id: '1', name: 'Pizzas', description: 'Nossas deliciosas pizzas', order: 1, active: true },
  { id: '2', name: 'Bebidas', description: 'Bebidas refrescantes', order: 2, active: true },
  { id: '3', name: 'Sobremesas', description: 'Doces para finalizar', order: 3, active: true },
  { id: '4', name: 'Entradas', description: 'Para começar bem', order: 4, active: true }
]

const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    name: 'Pizza Margherita',
    description: 'Molho de tomate, mussarela, manjericão fresco, azeitonas',
    price: 32.90,
    category: '1',
    available: true,
    preparationTime: 25,
    ingredients: ['Massa', 'Molho de tomate', 'Mussarela', 'Manjericão', 'Azeitonas'],
    allergens: ['Glúten', 'Lactose'],
    rating: 4.8
  },
  {
    id: '2',
    name: 'Pizza Calabresa',
    description: 'Molho de tomate, mussarela, calabresa, cebola roxa',
    price: 35.90,
    category: '1',
    available: true,
    preparationTime: 25,
    ingredients: ['Massa', 'Molho de tomate', 'Mussarela', 'Calabresa', 'Cebola'],
    allergens: ['Glúten', 'Lactose'],
    rating: 4.9
  },
  {
    id: '3',
    name: 'Coca-Cola 2L',
    description: 'Refrigerante tradicional gelado',
    price: 8.90,
    category: '2',
    available: true,
    preparationTime: 2
  },
  {
    id: '4',
    name: 'Pudim de Leite',
    description: 'Pudim caseiro com calda de caramelo',
    price: 12.50,
    category: '3',
    available: true,
    preparationTime: 5,
    allergens: ['Lactose', 'Ovos'],
    rating: 4.7
  }
]

export default function MenuManagement() {
  const router = useRouter()
  const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(DEFAULT_MENU_ITEMS)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  
  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: '',
    description: '',
    price: 0,
    category: categories[0]?.id || '',
    available: true,
    preparationTime: 15
  })

  const [newCategory, setNewCategory] = useState<Partial<MenuCategory>>({
    name: '',
    description: '',
    active: true
  })

  const handleSaveItem = () => {
    if (editingItem) {
      setMenuItems(prev => prev.map(item => 
        item.id === editingItem.id ? editingItem : item
      ))
      setEditingItem(null)
    } else if (showAddItem && newItem.name && newItem.price) {
      const item: MenuItem = {
        id: Date.now().toString(),
        name: newItem.name!,
        description: newItem.description || '',
        price: newItem.price!,
        category: newItem.category!,
        available: newItem.available!,
        preparationTime: newItem.preparationTime
      }
      setMenuItems(prev => [...prev, item])
      setNewItem({
        name: '',
        description: '',
        price: 0,
        category: categories[0]?.id || '',
        available: true,
        preparationTime: 15
      })
      setShowAddItem(false)
    }
  }

  const handleSaveCategory = () => {
    if (editingCategory) {
      setCategories(prev => prev.map(cat => 
        cat.id === editingCategory.id ? editingCategory : cat
      ))
      setEditingCategory(null)
    } else if (showAddCategory && newCategory.name) {
      const category: MenuCategory = {
        id: Date.now().toString(),
        name: newCategory.name!,
        description: newCategory.description,
        order: categories.length + 1,
        active: newCategory.active!
      }
      setCategories(prev => [...prev, category])
      setNewCategory({
        name: '',
        description: '',
        active: true
      })
      setShowAddCategory(false)
    }
  }

  const deleteItem = (id: string) => {
    setMenuItems(prev => prev.filter(item => item.id !== id))
  }

  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== id))
    setMenuItems(prev => prev.filter(item => item.category !== id))
  }

  const toggleItemAvailability = (id: string) => {
    setMenuItems(prev => prev.map(item =>
      item.id === id ? { ...item, available: !item.available } : item
    ))
  }

  const getCategoryName = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId)?.name || 'Sem categoria'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <UtensilsCrossed className="h-8 w-8 text-orange-600" />
                Cardápio Digital
              </h1>
              <p className="text-gray-600">Gerencie seu menu e preços</p>
            </div>
          </div>
          <Button onClick={() => {/* Save to backend */}}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Categories Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Categorias</CardTitle>
                <CardDescription>Organize seu cardápio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between p-2 rounded-lg border">
                    {editingCategory?.id === category.id ? (
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({
                            ...editingCategory,
                            name: e.target.value
                          })}
                          placeholder="Nome da categoria"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveCategory}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCategory(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <p className="font-medium">{category.name}</p>
                          <p className="text-xs text-gray-500">
                            {menuItems.filter(item => item.category === category.id).length} itens
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingCategory(category)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteCategory(category.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {showAddCategory ? (
                  <div className="p-2 border rounded-lg space-y-2">
                    <Input
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({
                        ...newCategory,
                        name: e.target.value
                      })}
                      placeholder="Nome da categoria"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveCategory}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAddCategory(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="dashed"
                    className="w-full"
                    onClick={() => setShowAddCategory(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Categoria
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Menu Items */}
          <div className="lg:col-span-3">
            <div className="space-y-6">
              {/* Add New Item */}
              {showAddItem ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Novo Item</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Nome do Item</Label>
                        <Input
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          placeholder="Ex: Pizza Margherita"
                        />
                      </div>
                      <div>
                        <Label>Preço (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Descrição</Label>
                      <Textarea
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        placeholder="Descreva os ingredientes e características..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Categoria</Label>
                        <select
                          value={newItem.category}
                          onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                          className="w-full p-2 border rounded-md"
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Tempo Preparo (min)</Label>
                        <Input
                          type="number"
                          value={newItem.preparationTime}
                          onChange={(e) => setNewItem({ ...newItem, preparationTime: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSaveItem}>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Item
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddItem(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  onClick={() => setShowAddItem(true)}
                  className="w-full h-16 border-2 border-dashed border-gray-300 text-gray-500 hover:border-orange-500 hover:text-orange-500"
                  variant="outline"
                >
                  <Plus className="h-6 w-6 mr-2" />
                  Adicionar Novo Item ao Cardápio
                </Button>
              )}

              {/* Menu Items by Category */}
              {categories.map((category) => {
                const categoryItems = menuItems.filter(item => item.category === category.id)
                
                if (categoryItems.length === 0) return null

                return (
                  <Card key={category.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {category.name}
                        <Badge variant="secondary">
                          {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'itens'}
                        </Badge>
                      </CardTitle>
                      {category.description && (
                        <CardDescription>{category.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {categoryItems.map((item) => (
                        <div
                          key={item.id}
                          className={`border rounded-lg p-4 ${
                            !item.available ? 'bg-gray-50 opacity-75' : ''
                          }`}
                        >
                          {editingItem?.id === item.id ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <Label>Nome</Label>
                                  <Input
                                    value={editingItem.name}
                                    onChange={(e) => setEditingItem({
                                      ...editingItem,
                                      name: e.target.value
                                    })}
                                  />
                                </div>
                                <div>
                                  <Label>Preço</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editingItem.price}
                                    onChange={(e) => setEditingItem({
                                      ...editingItem,
                                      price: parseFloat(e.target.value)
                                    })}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label>Descrição</Label>
                                <Textarea
                                  value={editingItem.description}
                                  onChange={(e) => setEditingItem({
                                    ...editingItem,
                                    description: e.target.value
                                  })}
                                  rows={2}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveItem}>
                                  <Save className="h-3 w-3 mr-1" />
                                  Salvar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between">
                              <div className="flex gap-4 flex-1">
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={item.name}
                                    className="w-16 h-16 object-cover rounded-lg"
                                  />
                                ) : (
                                  <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <h3 className="font-semibold text-lg flex items-center gap-2">
                                        {item.name}
                                        {!item.available && (
                                          <Badge variant="destructive">Indisponível</Badge>
                                        )}
                                        {item.rating && (
                                          <div className="flex items-center gap-1 text-sm">
                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                            {item.rating}
                                          </div>
                                        )}
                                      </h3>
                                      <p className="text-gray-600 text-sm mb-1">{item.description}</p>
                                      <div className="flex items-center gap-4 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                          <DollarSign className="h-3 w-3" />
                                          R$ {item.price.toFixed(2)}
                                        </div>
                                        {item.preparationTime && (
                                          <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {item.preparationTime} min
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {item.allergens && item.allergens.length > 0 && (
                                    <div className="flex gap-1 mt-2">
                                      <span className="text-xs text-gray-500">Alérgenos:</span>
                                      {item.allergens.map((allergen) => (
                                        <Badge key={allergen} variant="outline" className="text-xs">
                                          {allergen}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex gap-1 ml-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleItemAvailability(item.id)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingItem(item)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteItem(item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}