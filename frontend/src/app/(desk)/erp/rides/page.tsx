import { Suspense } from "react";

import { RideHistory } from "@/features/desk/ops-screens";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RideHistory />
    </Suspense>
  );
}
