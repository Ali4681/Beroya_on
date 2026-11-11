import "./neon-car.css";

import { cx } from "@/shared/lib/cx";

type NeonCarProps = {
  className?: string;
  alt?: string;
  carSrc?: string;
  frontWheelSrc?: string;
  rearWheelSrc?: string;
};

export function NeonCar({
  className,
  alt = "",
  carSrc = "/VIP/VIP.png",
  frontWheelSrc = "/VIP/wheel-front.png",
  rearWheelSrc = "/VIP/wheel-rear.png",
}: NeonCarProps) {
  return (
    <div className={cx("neon-car", "car", className)}>
      <img src={carSrc} alt={alt} draggable={false} />
      <img className="wheel wheel-front" src={frontWheelSrc} alt="" draggable={false} />
      <img className="wheel wheel-rear" src={rearWheelSrc} alt="" draggable={false} />
    </div>
  );
}
