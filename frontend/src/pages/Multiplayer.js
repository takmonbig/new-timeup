import { Users } from "lucide-react";
import { RoomList } from "@/components/RoomList";

export default function Multiplayer() {
  return (
    <RoomList mode="multiplayer" Icon={Users} title="Multiplayer Rooms"
      subtitle="Up to 25 players. Closest to the target wins the prize pool."
      payoutLabel="Prize pool" />
  );
}
