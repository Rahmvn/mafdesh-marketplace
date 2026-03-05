const NOTIFICATIONS_KEY = 'mafdesh_notifications';

export const NotificationType = {
  PRODUCT_APPROVED: 'product_approved',
  PRODUCT_REJECTED: 'product_rejected',
  VERIFICATION_APPROVED: 'verification_approved',
  VERIFICATION_REVOKED: 'verification_revoked',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  CHAT_MESSAGE: 'chat_message'
};

export const getAllNotifications = () => {
  try {
    const notifications = localStorage.getItem(NOTIFICATIONS_KEY);
    return notifications ? JSON.parse(notifications) : [];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
};

export const getSellerNotifications = (sellerId) => {
  const allNotifications = getAllNotifications();
  return allNotifications.filter(n => n.targetSellerId === sellerId);
};

export const getUnreadNotifications = (sellerId) => {
  const sellerNotifications = getSellerNotifications(sellerId);
  return sellerNotifications.filter(n => !n.read);
};

export const createNotification = (notificationData) => {
  const notifications = getAllNotifications();
  const newNotification = {
    id: Date.now(),
    ...notificationData,
    read: false,
    createdAt: new Date().toISOString()
  };
  
  notifications.push(newNotification);
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  return newNotification;
};

export const markAsRead = (notificationId) => {
  const notifications = getAllNotifications();
  const index = notifications.findIndex(n => n.id === notificationId);
  
  if (index !== -1) {
    notifications[index].read = true;
    notifications[index].readAt = new Date().toISOString();
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }
};

export const markAllAsRead = (sellerId) => {
  const notifications = getAllNotifications();
  const updated = notifications.map(n => {
    if (n.targetSellerId === sellerId && !n.read) {
      return {
        ...n,
        read: true,
        readAt: new Date().toISOString()
      };
    }
    return n;
  });
  
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
};

export const deleteNotification = (notificationId) => {
  const notifications = getAllNotifications();
  const filtered = notifications.filter(n => n.id !== notificationId);
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(filtered));
};
