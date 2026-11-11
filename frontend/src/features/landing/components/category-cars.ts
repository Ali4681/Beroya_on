type CategoryCar = { image: string };

const cars: Record<string, CategoryCar> = {
  daily: { image: "/cars/يومي.jpg" },
  vip: { image: "/cars/VIP.jpg" },
  family: { image: "/cars/عائلي.jpg" },
  women: { image: "/cars/سيدات.jpg" },
  xl: { image: "/cars/مجموعات كبيرة.jpg" },
  taxi: { image: "/cars/تكسي.jpg" },
};

export function categoryCar(id: string): CategoryCar {
  return cars[id] ?? cars.daily;
}
