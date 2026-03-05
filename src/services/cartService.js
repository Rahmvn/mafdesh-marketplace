
export const cartService = {
  getCart() {
    const user = JSON.parse(localStorage.getItem('mafdesh_user'));
    if (!user) return { cart: [], total: 0 };

    const carts = JSON.parse(localStorage.getItem('mafdesh_carts') || '{}');
    const userCart = carts[user.id] || [];

    const total = userCart.reduce((sum, item) => sum + item.subtotal, 0);

    return { cart: userCart, total };
  },

  addToCart(product, quantity = 1) {
    const user = JSON.parse(localStorage.getItem('mafdesh_user'));
    if (!user) throw new Error('Not logged in');

    const carts = JSON.parse(localStorage.getItem('mafdesh_carts') || '{}');
    

    const userCart = carts[user.id] || [];

    const existing = userCart.find(i => String(i.product_id) === String(product.id));

    if (existing) {
      existing.quantity += quantity;
      existing.subtotal = existing.quantity * product.price;
    } else {
      userCart.push({
  id: Date.now(),
  product_id: product.id,
  quantity,
  product_name: product.name,
  product_image: product.images?.[0] || null,
  price: product.price,
  seller_name: product.seller_name || 'Unknown Seller',
  stock_available: product.stock_quantity || 0,
  subtotal: quantity * product.price
});
    }

    carts[user.id] = userCart;
    localStorage.setItem('mafdesh_carts', JSON.stringify(carts));
  },

  updateCartItem(itemId, qty) {
    const user = JSON.parse(localStorage.getItem('mafdesh_user'));
    const carts = JSON.parse(localStorage.getItem('mafdesh_carts') || '{}');

    const cart = carts[user.id] || [];
    const item = cart.find(i => i.id == itemId);

    if (item) {
      item.quantity = qty;
      item.subtotal = item.price * qty;
    }

    carts[user.id] = cart;
    localStorage.setItem('mafdesh_carts', JSON.stringify(carts));
  },

  removeFromCart(itemId) {
    const user = JSON.parse(localStorage.getItem('mafdesh_user'));
    const carts = JSON.parse(localStorage.getItem('mafdesh_carts') || '{}');

    carts[user.id] = (carts[user.id] || []).filter(i => i.id != itemId);
    localStorage.setItem('mafdesh_carts', JSON.stringify(carts));
  }
};