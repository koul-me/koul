import { redirect } from "next/navigation";

/** The week 1 competition is over; its page now sends people to the live leaderboard. */
export default function CompetePage() {
  redirect("/compete/leaderboard");
}
