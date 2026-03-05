export const sellers = [
  {
    id: 1,
    name: "Sweet Treats",
    email: "seller@sweettreats.com",
    verified: true,
    joinedDate: "2024-01-15",
    totalSales: 1240,
    responseTime: "2 hours"
  },
  {
    id: 2,
    name: "Bakery Plus",
    email: "seller@bakeryplus.com",
    verified: true,
    joinedDate: "2024-02-20",
    totalSales: 856,
    responseTime: "1 hour"
  },
  {
    id: 3,
    name: "Snack World",
    email: "seller@snackworld.com",
    verified: false,
    joinedDate: "2024-06-10",
    totalSales: 234,
    responseTime: "4 hours"
  },
  {
    id: 4,
    name: "Drinks Hub",
    email: "seller@drinkshub.com",
    verified: true,
    joinedDate: "2024-03-05",
    totalSales: 567,
    responseTime: "3 hours"
  },
  {
    id: 5,
    name: "Healthy Bites",
    email: "seller@healthybites.com",
    verified: true,
    joinedDate: "2024-01-28",
    totalSales: 1100,
    responseTime: "1 hour"
  },
  {
    id: 6,
    name: "Tech Haven",
    email: "seller@techhaven.com",
    verified: true,
    joinedDate: "2023-11-10",
    totalSales: 2340,
    responseTime: "30 mins"
  },
  {
    id: 7,
    name: "Gadget Store",
    email: "seller@gadgetstore.com",
    verified: true,
    joinedDate: "2023-12-15",
    totalSales: 1890,
    responseTime: "1 hour"
  },
  {
    id: 8,
    name: "Audio Zone",
    email: "seller@audiozone.com",
    verified: true,
    joinedDate: "2024-02-01",
    totalSales: 1456,
    responseTime: "2 hours"
  },
  {
    id: 9,
    name: "Wearables Plus",
    email: "seller@wearablesplus.com",
    verified: false,
    joinedDate: "2024-07-20",
    totalSales: 145,
    responseTime: "5 hours"
  },
  {
    id: 10,
    name: "Accessories Hub",
    email: "seller@accessorieshub.com",
    verified: true,
    joinedDate: "2024-04-12",
    totalSales: 678,
    responseTime: "2 hours"
  },
  {
    id: 11,
    name: "Shoe Palace",
    email: "seller@shoepalace.com",
    verified: true,
    joinedDate: "2023-10-20",
    totalSales: 2100,
    responseTime: "1 hour"
  },
  {
    id: 12,
    name: "Leather Goods",
    email: "seller@leathergoods.com",
    verified: true,
    joinedDate: "2024-03-18",
    totalSales: 890,
    responseTime: "3 hours"
  },
  {
    id: 13,
    name: "Vision Style",
    email: "seller@visionstyle.com",
    verified: false,
    joinedDate: "2024-08-01",
    totalSales: 123,
    responseTime: "6 hours"
  },
  {
    id: 14,
    name: "Bag World",
    email: "seller@bagworld.com",
    verified: true,
    joinedDate: "2024-01-05",
    totalSales: 1340,
    responseTime: "2 hours"
  }
];

export const getSellerByName = (storeName) => {
  return sellers.find(seller => seller.name === storeName);
};

export const getSellerById = (id) => {
  return sellers.find(seller => seller.id === parseInt(id));
};
