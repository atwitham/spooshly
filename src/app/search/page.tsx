import { redirect } from "next/navigation";

// Old route from the previous version; kept so home-screen bookmarks still work.
export default function Page() {
  redirect("/");
}
