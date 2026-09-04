import { Swords } from "lucide-react";
import { RoomList } from "@/components/RoomList";

export default function OneVsOne() {
  return (
    <RoomList mode="1v1" Icon={Swords} title="1v1 Duels"
      subtitle="Head-to-head. 50 coins entry. Closest to the target wins 1.5× (75 coins)."
      payoutLabel="Winner gets" />
  );
}
